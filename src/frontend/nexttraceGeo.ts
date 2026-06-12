import { isPublicIp } from "../shared/ip";
import {
  NXTRACE_BATCH_SIZE,
  type EnrichmentSummary,
  type NxtraceGeo,
  type TraceResultResponse,
} from "../shared/types";

const NEXTTRACE_API_BASE = "https://api.nxtrace.org";

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
  const errors: EnrichmentSummary["errors"] = [];

  for (const chunk of chunks(publicIps, NXTRACE_BATCH_SIZE)) {
    try {
      const batch = await fetchBatch(chunk, nextToken, { ...options, fetcher });
      for (const result of batch.results) {
        if (result.ok && result.data) {
          geoByIp.set(result.ip, result.data);
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
      cached: 0,
      fetched: geoByIp.size,
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

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}
