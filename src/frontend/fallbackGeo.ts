import { isPublicIp } from "../shared/ip";
import type { EnrichmentSummary, NxtraceGeo, TraceResultResponse } from "../shared/types";

const IPINFO_API_BASE = "https://ipinfo.io";
const RIPESTAT_PREFIX_OVERVIEW_URL = "https://stat.ripe.net/data/prefix-overview/data.json";

interface BrowserFallbackOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}

interface IpinfoResponse {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  postal?: string;
  timezone?: string;
  org?: string;
  error?: unknown;
}

interface RipestatPrefixOverviewResponse {
  status?: string;
  data?: {
    resource?: string;
    asns?: Array<{
      asn?: number | string;
      holder?: string | null;
    }>;
  };
}

interface RipestatPrefixInfo {
  asnumber?: string;
  holder?: string;
  prefix?: string;
}

interface BrowserLookupResult {
  geo?: NxtraceGeo;
  errors: string[];
}

export async function enrichTraceWithBrowserFallback(
  trace: TraceResultResponse,
  options: BrowserFallbackOptions = {},
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

  const fetcher = options.fetcher || fetch;
  const geoByIp = new Map<string, NxtraceGeo>();
  const errorByIp = new Map<string, string>();
  const errors: EnrichmentSummary["errors"] = [];

  for (const ip of publicIps) {
    const lookup = await lookupBrowserGeo(ip, { ...options, fetcher });
    for (const message of lookup.errors) {
      errors.push({ ips: [ip], message });
    }
    if (lookup.geo) {
      geoByIp.set(ip, lookup.geo);
      continue;
    }
    errorByIp.set(ip, lookup.errors[0] || "browser GeoIP fallback failed");
  }

  return {
    ...applyBrowserEnrichment(traceWithPrivateFlags, geoByIp, errorByIp),
    enrichment: {
      status: errors.length || errorByIp.size ? "partial" : "complete",
      cached: 0,
      fetched: geoByIp.size,
      errors,
    },
  };
}

export async function fetchIpinfoGeo(ip: string, options: BrowserFallbackOptions = {}): Promise<NxtraceGeo> {
  const response = await (options.fetcher || fetch)(`${IPINFO_API_BASE}/${encodeURIComponent(ip)}`, {
    headers: { Accept: "application/json" },
    signal: options.signal,
  });
  const body = (await response.json().catch(() => null)) as IpinfoResponse | null;
  if (!response.ok || !body || typeof body !== "object" || body.error) {
    throw new Error(`ipinfo lookup failed with HTTP ${response.status}`);
  }
  return ipinfoToGeo(ip, body);
}

export async function fetchRipestatPrefixOverview(
  ip: string,
  options: BrowserFallbackOptions = {},
): Promise<RipestatPrefixInfo | null> {
  const url = new URL(RIPESTAT_PREFIX_OVERVIEW_URL);
  url.searchParams.set("resource", ip);
  const response = await (options.fetcher || fetch)(url.toString(), {
    headers: { Accept: "application/json" },
    signal: options.signal,
  });
  const body = (await response.json().catch(() => null)) as RipestatPrefixOverviewResponse | null;
  if (!response.ok || !body || body.status !== "ok") {
    throw new Error(`RIPEstat prefix overview failed with HTTP ${response.status}`);
  }

  const asn = body.data?.asns?.find((item) => item.asn !== undefined);
  const asnumber = asn?.asn !== undefined ? normalizeAsnumber(asn.asn) : undefined;
  const holder = asn?.holder?.trim() || undefined;
  const prefix = body.data?.resource?.trim() || undefined;
  if (!asnumber && !holder && !prefix) return null;
  return { asnumber, holder, prefix };
}

async function lookupBrowserGeo(
  ip: string,
  options: Required<Pick<BrowserFallbackOptions, "fetcher">> & BrowserFallbackOptions,
): Promise<BrowserLookupResult> {
  try {
    let geo = await fetchIpinfoGeo(ip, options);
    const errors: string[] = [];
    if (!geo.asnumber) {
      try {
        const prefix = await fetchRipestatPrefixOverview(ip, options);
        if (prefix) {
          geo = mergeRipestatPrefix(geo, prefix);
        }
      } catch (error) {
        if (isAbortError(error)) throw error;
        errors.push(error instanceof Error ? error.message : "RIPEstat prefix overview failed");
      }
    }
    return { geo, errors };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { errors: [error instanceof Error ? error.message : "ipinfo lookup failed"] };
  }
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

function applyBrowserEnrichment(
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

function ipinfoToGeo(ip: string, body: IpinfoResponse): NxtraceGeo {
  const org = parseIpinfoOrg(body.org);
  const coordinates = parseLoc(body.loc);
  return {
    ip,
    asnumber: org.asnumber,
    country: body.country?.trim() || undefined,
    prov: body.region?.trim() || undefined,
    city: body.city?.trim() || undefined,
    owner: org.owner,
    lat: coordinates?.lat,
    lng: coordinates?.lng,
    source: "ipinfo",
  };
}

function parseIpinfoOrg(value: string | undefined): { asnumber?: string; owner?: string } {
  const org = value?.trim();
  if (!org) return {};
  const match = org.match(/^AS(\d+)\s*(.*)$/i);
  if (!match) return { owner: org };
  return {
    asnumber: `AS${match[1]}`,
    owner: match[2]?.trim() || undefined,
  };
}

function parseLoc(value: string | undefined): { lat: number; lng: number } | undefined {
  const [latRaw, lngRaw] = value?.split(",") || [];
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function mergeRipestatPrefix(geo: NxtraceGeo, prefix: RipestatPrefixInfo): NxtraceGeo {
  return {
    ...geo,
    asnumber: geo.asnumber || prefix.asnumber,
    owner: geo.owner || prefix.holder,
    prefix: geo.prefix || prefix.prefix,
    source: "ipinfo+RIPEstat",
  };
}

function normalizeAsnumber(value: number | string): string | undefined {
  const text = String(value).trim();
  if (!text) return undefined;
  return text.toUpperCase().startsWith("AS") ? text.toUpperCase() : `AS${text}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
