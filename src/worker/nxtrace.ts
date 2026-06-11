import {
  NXTRACE_BATCH_SIZE,
  NXTRACE_CACHE_TTL_SECONDS,
  type EnrichmentSummary,
  type NxtraceGeo,
  type TraceHop,
  type TraceResultResponse,
} from "../shared/types";
import { trimTrailingSlash } from "./http";
import { defaultFetch } from "./fetcher";

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

export function isPublicIp(ip: string): boolean {
  if (ip.includes(":")) {
    return isPublicIpv6(ip);
  }

  return isPublicIpv4(ip);
}

function isPublicIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 88 && parts[2] === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && parts[2] === 100) return false;
  if (a === 203 && b === 0 && parts[2] === 113) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(ip: string): boolean {
  const hextets = expandIpv6(ip.toLowerCase().split("%")[0]);
  if (!hextets) return false;

  const mappedIpv4 = ipv4FromMappedIpv6(hextets);
  if (mappedIpv4) return isPublicIpv4(mappedIpv4);

  if (hextets.every((hextet) => hextet === 0)) return false;
  if (hextets.slice(0, 7).every((hextet) => hextet === 0) && hextets[7] === 1) return false;

  const first = hextets[0];
  if ((first & 0xff00) === 0xff00) return false;
  if ((first & 0xfe00) === 0xfc00) return false;
  if ((first & 0xffc0) === 0xfe80) return false;
  if ((first & 0xffc0) === 0xfec0) return false;
  if (first === 0x2001 && hextets[1] === 0x0db8) return false;
  return true;
}

function expandIpv6(ip: string): number[] | null {
  if (!ip || ip.split("::").length > 2) return null;

  const hasCompression = ip.includes("::");
  const [head = "", tail = ""] = ip.split("::");
  const headParts = parseIpv6Parts(head);
  const tailParts = parseIpv6Parts(tail);
  if (!headParts || !tailParts) return null;

  if (!hasCompression) {
    return headParts.length === 8 ? headParts : null;
  }

  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 1) return null;
  return [...headParts, ...Array.from({ length: missing }, () => 0), ...tailParts];
}

function parseIpv6Parts(value: string): number[] | null {
  if (!value) return [];
  const parts = value.split(":");
  const out: number[] = [];

  for (const part of parts) {
    if (!part) return null;
    if (part.includes(".")) {
      const embedded = ipv4ToHextets(part);
      if (!embedded) return null;
      out.push(...embedded);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    out.push(parseInt(part, 16));
  }

  return out.length <= 8 ? out : null;
}

function ipv4ToHextets(ip: string): [number, number] | null {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return [(parts[0] << 8) + parts[1], (parts[2] << 8) + parts[3]];
}

function ipv4FromMappedIpv6(hextets: number[]): string | null {
  const mapped = hextets.slice(0, 5).every((hextet) => hextet === 0) && hextets[5] === 0xffff;
  if (!mapped) return null;
  return [
    hextets[6] >> 8,
    hextets[6] & 0xff,
    hextets[7] >> 8,
    hextets[7] & 0xff,
  ].join(".");
}
