import {
  NXTRACE_BATCH_SIZE,
  NXTRACE_CACHE_TTL_SECONDS,
  type EnrichmentSummary,
  type NxtraceGeo,
  type TraceHop,
  type TraceResultResponse,
} from "../shared/types";
import { isPublicIp } from "../shared/ip";
import { trimTrailingSlash } from "./http";
import { defaultFetch } from "./fetcher";

export { isPublicIp };

export interface NxtraceEnricherOptions {
  apiBase?: string;
  token?: string;
  cache?: Cache;
  fetcher?: typeof fetch;
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
    try {
      const batch = await fetchBatch(chunk, {
        apiBase: options.apiBase,
        token,
        fetcher,
      });
      for (const result of batch.results) {
        if (result.ok && result.data) {
          geoByIp.set(result.ip, result.data);
          fetched += 1;
          await writeCachedGeo(cache, result.ip, result.data);
        } else {
          errorByIp.set(result.ip, result.error || "nxtrace lookup failed");
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "nxtrace batch request failed";
      errors.push({ ips: chunk, message });
      for (const ip of chunk) {
        errorByIp.set(ip, message);
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
  const response = await options.fetcher(`${apiBase}/v4/ipGeo/batch`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-NextTrace-Token": options.token,
      "User-Agent": "GlobalTrace/0.1",
    },
    body: JSON.stringify({ ips }),
  });
  const body = (await response.json().catch(() => null)) as BatchResponse | null;
  if (!response.ok || !body || !Array.isArray(body.results)) {
    throw new Error(`nxtrace batch failed with HTTP ${response.status}`);
  }
  return body;
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
