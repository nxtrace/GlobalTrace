import {
  NXTRACE_BATCH_SIZE,
  NXTRACE_CACHE_TTL_SECONDS,
  type EnrichmentSummary,
  type NxtraceGeo,
  type TraceHop,
  type TraceResultResponse,
} from "../shared/types";
import { isPublicIp } from "../shared/ip";
import { readJsonResponseWithLimit, trimTrailingSlash } from "./http";
import { defaultFetch, withUpstreamTimeout } from "./fetcher";

export { isPublicIp };

export interface NxtraceEnricherOptions {
  apiBase?: string;
  token?: string;
  cache?: Cache;
  fetcher?: typeof fetch;
  waitUntil?: (promise: Promise<unknown>) => void;
}

interface BatchResult {
  ip: string;
  ok: boolean;
  data?: NxtraceGeo;
  error?: string;
}

interface BatchResponse {
  results: BatchResult[];
}

const NXTRACE_RESPONSE_LIMIT_BYTES = 1_000_000;

class NxtraceBatchError extends Error {
  readonly retryBySplit: boolean;

  constructor(message: string, retryBySplit: boolean) {
    super(message);
    this.name = "NxtraceBatchError";
    this.retryBySplit = retryBySplit;
  }
}

interface SplitBatchResponse {
  results: BatchResult[];
  errors: EnrichmentSummary["errors"];
}

export async function enrichTraceResponse(
  trace: TraceResultResponse,
  options: NxtraceEnricherOptions,
): Promise<TraceResultResponse> {
  if (trace.status !== "finished") {
    return trace;
  }

  const hops = trace.results.flatMap((result) => result.hops);
  const publicIps = uniquePublicHopIps(hops);
  if (publicIps.length === 0) {
    return {
      ...trace,
      enrichment: { status: "skipped", cached: 0, fetched: 0, errors: [] },
    };
  }

  const token = options.token?.trim();
  if (!token) {
    return markEnrichmentError(trace, publicIps, "NXTRACE_API_V4_TOKEN is not configured");
  }

  const fetcher = options.fetcher || defaultFetch;
  const cache = options.cache;
  const geoByIp = new Map<string, NxtraceGeo>();
  const errorByIp = new Map<string, string>();
  const missed: string[] = [];
  let cached = 0;
  let fetched = 0;
  const errors: EnrichmentSummary["errors"] = [];

  for (const ip of publicIps) {
    const cachedGeo = await readCachedGeo(cache, ip);
    if (cachedGeo) {
      geoByIp.set(ip, cachedGeo);
      cached += 1;
    } else {
      missed.push(ip);
    }
  }

  for (const chunk of chunks(missed, NXTRACE_BATCH_SIZE)) {
    const batch = await fetchBatchWithSplit(chunk, {
      apiBase: options.apiBase,
      token,
      fetcher,
    });
    errors.push(...batch.errors);
    for (const result of batch.results) {
      if (result.ok && result.data) {
        geoByIp.set(result.ip, result.data);
        fetched += 1;
        const write = writeCachedGeo(cache, result.ip, result.data);
        if (options.waitUntil) {
          options.waitUntil(write.catch(() => undefined));
        } else {
          await write;
        }
      } else {
        const message = result.error || "nxtrace lookup failed";
        errorByIp.set(result.ip, message);
        errors.push({ ips: [result.ip], message });
      }
    }
    for (const error of batch.errors) {
      for (const ip of error.ips) {
        errorByIp.set(ip, error.message);
      }
    }
  }

  const result = applyEnrichment(trace, geoByIp, errorByIp);
  return {
    ...result,
    enrichment: {
      status: errors.length || errorByIp.size ? "partial" : "complete",
      cached,
      fetched,
      errors,
    },
  };
}

export function uniquePublicHopIps(hops: TraceHop[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hop of hops) {
    if (!hop.ip || !isPublicIp(hop.ip)) {
      hop.privateAddress = Boolean(hop.ip);
      continue;
    }
    if (!seen.has(hop.ip)) {
      seen.add(hop.ip);
      out.push(hop.ip);
    }
  }
  return out;
}

function applyEnrichment(
  trace: TraceResultResponse,
  geoByIp: Map<string, NxtraceGeo>,
  errorByIp: Map<string, string>,
): TraceResultResponse {
  return {
    ...trace,
    results: trace.results.map((result) => ({
      ...result,
      hops: result.hops.map((hop) => {
        if (!hop.ip) return hop;
        const geo = geoByIp.get(hop.ip);
        if (geo) return { ...hop, geo };
        const enrichmentError = errorByIp.get(hop.ip);
        if (enrichmentError) return { ...hop, enrichmentError };
        return hop;
      }),
    })),
  };
}

function markEnrichmentError(trace: TraceResultResponse, ips: string[], message: string): TraceResultResponse {
  return {
    ...applyEnrichment(trace, new Map(), new Map(ips.map((ip) => [ip, message]))),
    enrichment: {
      status: "skipped",
      cached: 0,
      fetched: 0,
      errors: [{ ips, message }],
    },
  };
}

async function fetchBatch(
  ips: string[],
  options: { apiBase?: string; token: string; fetcher: typeof fetch },
): Promise<BatchResponse> {
  const apiBase = trimTrailingSlash(options.apiBase || "https://api.nxtrace.org");
  const response = await options.fetcher(`${apiBase}/v4/ipGeo/batch`, withUpstreamTimeout({
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-NextTrace-Token": options.token,
      "User-Agent": "GlobalTrace/0.1",
    },
    body: JSON.stringify({ ips }),
  }));
  const body = await readJsonResponseWithLimit<BatchResponse>(response, NXTRACE_RESPONSE_LIMIT_BYTES);
  if (!response.ok) {
    throw new NxtraceBatchError(`nxtrace batch failed with HTTP ${response.status}`, isSplitRetryableStatus(response.status));
  }
  if (!body || !Array.isArray(body.results)) {
    throw new NxtraceBatchError(`nxtrace batch failed with HTTP ${response.status}`, true);
  }
  return body;
}

async function fetchBatchWithSplit(
  ips: string[],
  options: { apiBase?: string; token: string; fetcher: typeof fetch },
): Promise<SplitBatchResponse> {
  try {
    return { results: (await fetchBatch(ips, options)).results, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "nxtrace batch request failed";
    if (ips.length > 1 && error instanceof NxtraceBatchError && error.retryBySplit) {
      const midpoint = Math.ceil(ips.length / 2);
      const left = await fetchBatchWithSplit(ips.slice(0, midpoint), options);
      const right = await fetchBatchWithSplit(ips.slice(midpoint), options);
      return {
        results: [...left.results, ...right.results],
        errors: [...left.errors, ...right.errors],
      };
    }
    return { results: [], errors: [{ ips, message }] };
  }
}

function isSplitRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function readCachedGeo(cache: Cache | undefined, ip: string): Promise<NxtraceGeo | null> {
  if (!cache) return null;
  const response = await cache.match(cacheKey(ip));
  if (!response?.ok) return null;
  return (await response.json().catch(() => null)) as NxtraceGeo | null;
}

async function writeCachedGeo(cache: Cache | undefined, ip: string, geo: NxtraceGeo): Promise<void> {
  if (!cache) return;
  await cache.put(
    cacheKey(ip),
    new Response(JSON.stringify(geo), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${NXTRACE_CACHE_TTL_SECONDS}`,
      },
    }),
  );
}

function cacheKey(ip: string): Request {
  return new Request(`https://globaltrace.local/cache/nxtrace/${encodeURIComponent(ip)}`);
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}
