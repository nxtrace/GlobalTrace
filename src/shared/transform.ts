import type {
  GlobalpingMeasurement,
  GlobalpingMtrHop,
  GlobalpingResultItem,
} from "./globalping";
import {
  type EnrichmentSummary,
  type MtrHopStats,
  type TraceHop,
  type TraceProbe,
  type TraceProbeResult,
  type TraceResultResponse,
} from "./types";

const EMPTY_ENRICHMENT: EnrichmentSummary = {
  status: "skipped",
  cached: 0,
  fetched: 0,
  errors: [],
};

export function measurementToTraceResponse(measurement: GlobalpingMeasurement): TraceResultResponse {
  return {
    measurementId: measurement.id,
    type: "mtr",
    target: measurement.target,
    status: measurement.status === "finished" ? "finished" : measurement.status === "in-progress" ? "in-progress" : "error",
    createdAt: measurement.createdAt,
    updatedAt: measurement.updatedAt,
    probesCount: measurement.probesCount,
    results: (measurement.results || []).map(toTraceProbeResult),
    enrichment: EMPTY_ENRICHMENT,
  };
}

function toTraceProbeResult(item: GlobalpingResultItem, index: number): TraceProbeResult {
  const result = item.result || { status: "in-progress" };
  return {
    id: `${item.probe.country}-${item.probe.city}-${item.probe.asn}-${index}`,
    probe: toTraceProbe(item),
    status: result.status,
    resolvedAddress: result.resolvedAddress ?? null,
    resolvedHostname: result.resolvedHostname ?? null,
    hops: (result.hops || []).map(toTraceHop),
    rawOutput: result.rawOutput || "",
  };
}

function toTraceProbe(item: GlobalpingResultItem): TraceProbe {
  return {
    continent: item.probe.continent,
    region: item.probe.region,
    country: item.probe.country,
    state: item.probe.state,
    city: item.probe.city,
    asn: item.probe.asn,
    latitude: item.probe.latitude,
    longitude: item.probe.longitude,
    network: item.probe.network,
    tags: item.probe.tags || [],
    resolvers: item.probe.resolvers || [],
  };
}

function toTraceHop(hop: GlobalpingMtrHop, index: number): TraceHop {
  return {
    ttl: index + 1,
    ip: hop.resolvedAddress ?? null,
    hostname: hop.resolvedHostname ?? null,
    asn: Array.isArray(hop.asn) ? hop.asn : [],
    timingsMs: (hop.timings || []).map((timing) => timing.rtt),
    stats: hop.stats ? toStats(hop.stats) : null,
  };
}

function toStats(stats: NonNullable<GlobalpingMtrHop["stats"]>): MtrHopStats {
  return {
    min: stats.min ?? null,
    avg: stats.avg ?? null,
    max: stats.max ?? null,
    total: stats.total ?? 0,
    rcv: stats.rcv ?? 0,
    drop: stats.drop ?? 0,
    loss: stats.loss ?? 0,
    stDev: stats.stDev ?? null,
    jMin: stats.jMin ?? null,
    jAvg: stats.jAvg ?? null,
    jMax: stats.jMax ?? null,
  };
}
