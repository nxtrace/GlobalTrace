export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
export const DEFAULT_PROBE_LIMIT = 3;
export const DEFAULT_TRACE_PACKETS = 5;
export const MIN_TRACE_PACKETS = 1;
export const MAX_TRACE_PACKETS = 16;
export const MAX_TRACE_PROBES = 10;
export const NXTRACE_BATCH_SIZE = 16;
export const NXTRACE_CACHE_TTL_SECONDS = 86400;

export type TraceProtocol = "ICMP" | "TCP" | "UDP";
export type TraceStatus = "in-progress" | "finished" | "error";
export type ProbeNetworkKind = "eyeball" | "datacenter";

export interface TraceFilters {
  country?: string;
  city?: string;
  asn?: string;
  network?: string;
  tag?: string;
  eyeball?: boolean;
  datacenter?: boolean;
  magic?: string;
}

export interface TraceCreateRequest {
  target: string;
  protocol?: TraceProtocol;
  port?: number;
  packets?: number;
  ipVersion?: 4 | 6;
  limit?: number;
  filters?: TraceFilters;
}

export interface TraceCreateResponse {
  measurementId: string;
  probesCount: number;
  location: string | null;
}

export interface ApiErrorResponse {
  error: {
    message: string;
    details?: unknown;
  };
}

export interface ProbeLocation {
  continent: string;
  region: string;
  country: string;
  state: string | null;
  city: string;
  asn: number;
  latitude: number;
  longitude: number;
  network: string;
}

export interface GlobalpingProbe {
  version?: string;
  location: ProbeLocation;
  tags: string[];
  resolvers?: string[];
}

export interface ProbeListResponse {
  probes: GlobalpingProbe[];
  fetchedAt: string;
}

export interface TraceProbe {
  continent: string;
  region: string;
  country: string;
  state: string | null;
  city: string;
  asn: number;
  latitude: number;
  longitude: number;
  network: string;
  tags: string[];
  resolvers: string[];
}

export interface MtrHopStats {
  min: number | null;
  avg: number | null;
  max: number | null;
  total: number;
  rcv: number;
  drop: number;
  loss: number;
  stDev?: number | null;
  jMin?: number | null;
  jAvg?: number | null;
  jMax?: number | null;
}

export interface NxtraceGeo {
  ip: string;
  asnumber?: string;
  country?: string;
  country_en?: string;
  prov?: string;
  prov_en?: string;
  city?: string;
  city_en?: string;
  district?: string;
  owner?: string;
  isp?: string;
  domain?: string;
  whois?: string;
  lat?: number;
  lng?: number;
  prefix?: string;
  router?: Record<string, string[]>;
  source?: string;
}

export interface TraceHop {
  ttl: number;
  ip: string | null;
  hostname: string | null;
  asn: number[];
  timingsMs: number[];
  stats: MtrHopStats | null;
  geo?: NxtraceGeo;
  enrichmentError?: string;
  privateAddress?: boolean;
}

export interface TraceProbeResult {
  id: string;
  probe: TraceProbe;
  status: string;
  resolvedAddress: string | null;
  resolvedHostname: string | null;
  hops: TraceHop[];
  rawOutput: string;
}

export interface EnrichmentBatchError {
  ips: string[];
  message: string;
}

export interface EnrichmentSummary {
  status: "skipped" | "partial" | "complete";
  cached: number;
  fetched: number;
  errors: EnrichmentBatchError[];
}

export interface TraceResultResponse {
  measurementId: string;
  type: "mtr";
  target: string;
  status: TraceStatus;
  createdAt?: string;
  updatedAt?: string;
  probesCount: number;
  results: TraceProbeResult[];
  enrichment: EnrichmentSummary;
}

export interface TraceEnrichRequest {
  measurementId?: string;
}

export interface GlobalpingLimitResponse {
  measurements: {
    create: {
      type: string;
      limit: number;
      remaining: number;
      reset: number;
    };
  };
  credits?: {
    remaining?: number;
  };
}
