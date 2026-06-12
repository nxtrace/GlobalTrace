import { isPublicIp } from "../shared/ip";
import {
  NXTRACE_BATCH_SIZE,
  NXTRACE_CACHE_TTL_SECONDS,
  type EnrichmentSummary,
  type NxtraceGeo,
  type TraceResultResponse,
} from "../shared/types";

const NEXTTRACE_API_BASE = "https://api.nxtrace.org";
const NEXTTRACE_GEO_CACHE_PREFIX = "globaltrace.nexttraceGeo.v1:";

interface NexttraceTokenOptions {
  signal?: AbortSignal;
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

interface CachedNexttraceGeo {
  expiresAt: number;
  geo: NxtraceGeo;
}

export async function enrichTraceWithNexttraceToken(
  trace: TraceResultResponse,
  token: string,
  options: NexttraceTokenOptions = {},
): Promise<TraceResultResponse> {
  if (trace.status !== "finished") {
    return trace;
  }

  const { trace: traceWithPrivateFlags, publicIps } = collectPublicHopIps(trace);
  if (publicIps.length === 0) {
    return {
      ...traceWithPrivateFlags,
      enrichment: { status: "skipped", cached: 0, fetched: 0, errors: [] },
    };
  }

  const nextToken = token.trim();
  if (!nextToken) {
    return markEnrichmentError(traceWithPrivateFlags, publicIps, "NextTrace API Token is not configured");
  }

  const fetcher = options.fetcher || fetch;
  const geoByIp = new Map<string, NxtraceGeo>();
  const errorByIp = new Map<string, string>();
  const missed: string[] = [];
  const errors: EnrichmentSummary["errors"] = [];
  let cached = 0;
  let fetched = 0;

  for (const ip of publicIps) {
    const cachedGeo = readCachedGeo(ip);
    if (cachedGeo) {
      geoByIp.set(ip, cachedGeo);
      cached += 1;
    } else {
      missed.push(ip);
    }
  }

  for (const chunk of chunks(missed, NXTRACE_BATCH_SIZE)) {
    try {
      const batch = await fetchBatch(chunk, nextToken, { ...options, fetcher });
      for (const result of batch.results) {
        if (result.ok && result.data) {
          geoByIp.set(result.ip, result.data);
          fetched += 1;
          writeCachedGeo(result.ip, result.data);
          continue;
        }
        const message = result.error || "nexttrace lookup failed";
        errorByIp.set(result.ip, message);
        errors.push({ ips: [result.ip], message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "nexttrace batch request failed";
      errors.push({ ips: chunk, message });
      for (const ip of chunk) {
        errorByIp.set(ip, message);
      }
    }
  }

  return {
    ...applyEnrichment(traceWithPrivateFlags, geoByIp, errorByIp),
    enrichment: {
      status: errors.length || errorByIp.size ? "partial" : "complete",
      cached,
      fetched,
      errors,
    },
  };
}

async function fetchBatch(
  ips: string[],
  token: string,
  options: Required<Pick<NexttraceTokenOptions, "fetcher">> & NexttraceTokenOptions,
): Promise<BatchResponse> {
  const response = await options.fetcher(`${NEXTTRACE_API_BASE}/v4/ipGeo/batch`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-NextTrace-Token": token,
    },
    body: JSON.stringify({ ips }),
    signal: options.signal,
  });
  const body = (await response.json().catch(() => null)) as BatchResponse | null;
  if (!response.ok || !body || !Array.isArray(body.results)) {
    throw new Error(`nexttrace batch failed with HTTP ${response.status}`);
  }
  return body;
}

function collectPublicHopIps(trace: TraceResultResponse): { trace: TraceResultResponse; publicIps: string[] } {
  const seen = new Set<string>();
  const publicIps: string[] = [];
  const nextTrace: TraceResultResponse = {
    ...trace,
    results: trace.results.map((result) => ({
      ...result,
      hops: result.hops.map((hop) => {
        if (!hop.ip) return hop;
        if (!isPublicIp(hop.ip)) {
          return { ...hop, privateAddress: true };
        }
        if (!seen.has(hop.ip)) {
          seen.add(hop.ip);
          publicIps.push(hop.ip);
        }
        return hop;
      }),
    })),
  };
  return { trace: nextTrace, publicIps };
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

function readCachedGeo(ip: string): NxtraceGeo | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  const key = cacheKey(ip);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isCachedNexttraceGeo(parsed, ip) || parsed.expiresAt <= Date.now()) {
      storage.removeItem(key);
      return null;
    }
    return parsed.geo;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore storage failures; the next request can still fetch fresh data.
    }
    return null;
  }
}

function writeCachedGeo(ip: string, geo: NxtraceGeo): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    const value: CachedNexttraceGeo = {
      expiresAt: Date.now() + NXTRACE_CACHE_TTL_SECONDS * 1000,
      geo,
    };
    storage.setItem(cacheKey(ip), JSON.stringify(value));
  } catch {
    // Cache writes are best-effort and must not affect trace rendering.
  }
}

function getLocalStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function cacheKey(ip: string): string {
  return `${NEXTTRACE_GEO_CACHE_PREFIX}${ip}`;
}

function isCachedNexttraceGeo(value: unknown, ip: string): value is CachedNexttraceGeo {
  if (!isRecord(value) || typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) {
    return false;
  }
  return isNxtraceGeo(value.geo, ip);
}

function isNxtraceGeo(value: unknown, ip: string): value is NxtraceGeo {
  return isRecord(value) && value.ip === ip;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}
