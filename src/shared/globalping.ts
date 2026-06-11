import { buildMagicFromFilters } from "./filters";
import {
  DEFAULT_PROBE_LIMIT,
  MAX_TRACE_PROBES,
  type TraceCreateRequest,
  type TraceProtocol,
} from "./types";

export interface GlobalpingMeasurement {
  id: string;
  type: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  target: string;
  probesCount: number;
  locations?: unknown[];
  measurementOptions?: unknown;
  results?: GlobalpingResultItem[];
}

export interface GlobalpingResultItem {
  probe: {
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
  };
  result: {
    status: string;
    rawOutput?: string;
    resolvedAddress?: string | null;
    resolvedHostname?: string | null;
    hops?: GlobalpingMtrHop[];
  };
}

export interface GlobalpingMtrHop {
  resolvedAddress?: string | null;
  resolvedHostname?: string | null;
  asn?: number[];
  timings?: Array<{ rtt: number }>;
  stats?: {
    min?: number | null;
    avg?: number | null;
    max?: number | null;
    total?: number;
    rcv?: number;
    drop?: number;
    loss?: number;
    stDev?: number | null;
    jMin?: number | null;
    jAvg?: number | null;
    jMax?: number | null;
  };
}

export interface ValidatedTraceCreate {
  target: string;
  protocol: TraceProtocol;
  port?: number;
  packets: number;
  ipVersion?: 4 | 6;
  limit: number;
  locations: string[];
  turnstileToken?: string;
}

export function validateTraceCreate(input: TraceCreateRequest): ValidatedTraceCreate {
  const target = String(input.target ?? "").trim();
  if (!target) {
    throw new Error("target is required");
  }
  if (target.length > 253) {
    throw new Error("target is too long");
  }

  const protocol = normalizeProtocol(input.protocol);
  const port = input.port;
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) {
    throw new Error("port must be within range 0-65535");
  }

  const packets = input.packets ?? 3;
  if (!Number.isInteger(packets) || packets < 1 || packets > 16) {
    throw new Error("packets must be within range 1-16");
  }

  const ipVersion = input.ipVersion;
  if (ipVersion !== undefined && ipVersion !== 4 && ipVersion !== 6) {
    throw new Error("ipVersion must be 4 or 6");
  }

  const limit = input.limit ?? DEFAULT_PROBE_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TRACE_PROBES) {
    throw new Error(`limit must be within range 1-${MAX_TRACE_PROBES}`);
  }

  return {
    target,
    protocol,
    port,
    packets,
    ipVersion,
    limit,
    locations: buildMagicFromFilters(input.filters),
    turnstileToken: input.turnstileToken,
  };
}

export function toGlobalpingMeasurementRequest(input: ValidatedTraceCreate): unknown {
  const measurementOptions: Record<string, unknown> = {
    protocol: input.protocol,
    packets: input.packets,
  };
  if (input.port !== undefined) {
    measurementOptions.port = input.port;
  }
  if (input.ipVersion !== undefined) {
    measurementOptions.ipVersion = input.ipVersion;
  }

  return {
    type: "mtr",
    target: input.target,
    locations: input.locations.map((magic) => ({ magic })),
    limit: input.limit,
    inProgressUpdates: true,
    measurementOptions,
  };
}

function normalizeProtocol(value: TraceProtocol | undefined): TraceProtocol {
  const protocol = String(value || "ICMP").toUpperCase();
  if (protocol === "ICMP" || protocol === "TCP" || protocol === "UDP") {
    return protocol;
  }
  throw new Error("protocol must be ICMP, TCP, or UDP");
}
