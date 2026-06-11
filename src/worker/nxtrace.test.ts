import { describe, expect, it, vi } from "vitest";
import type { NxtraceGeo, TraceHop, TraceResultResponse } from "../shared/types";
import { enrichTraceResponse, isPublicIp, uniquePublicHopIps } from "./nxtrace";

class MemoryCache implements Cache {
  private readonly store = new Map<string, Response>();

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const key = request instanceof Request ? request.url : String(request);
    return this.store.get(key)?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    const key = request instanceof Request ? request.url : String(request);
    this.store.set(key, response.clone());
  }

  add(): Promise<void> {
    throw new Error("not implemented");
  }

  addAll(): Promise<void> {
    throw new Error("not implemented");
  }

  delete(): Promise<boolean> {
    throw new Error("not implemented");
  }

  keys(): Promise<readonly Request[]> {
    throw new Error("not implemented");
  }

  matchAll(): Promise<readonly Response[]> {
    throw new Error("not implemented");
  }
}

describe("nxtrace enrichment", () => {
  it("chunks nxtrace batch lookups at 64 unique public IPs and caches successful data", async () => {
    const cache = new MemoryCache();
    const trace = sampleTrace(65);
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const ips = JSON.parse(String(init?.body)).ips as string[];
      return new Response(
        JSON.stringify({
          results: ips.map((ip) => ({ ip, ok: true, data: geo(ip) })),
        }),
      );
    }) as unknown as typeof fetch;

    const enriched = await enrichTraceResponse(trace, {
      apiBase: "https://nxtrace.test",
      token: "secret",
      cache,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(enriched.enrichment.fetched).toBe(65);
    expect(enriched.results[0]?.hops[0]?.geo?.source).toBe("mock");

    await enrichTraceResponse(trace, {
      apiBase: "https://nxtrace.test",
      token: "secret",
      cache,
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reports a failed nxtrace batch as partial enrichment", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "bad gateway" }), { status: 502 })) as
      unknown as typeof fetch;

    const enriched = await enrichTraceResponse(sampleTrace(2), {
      apiBase: "https://nxtrace.test",
      token: "secret",
      fetcher,
    });

    expect(enriched.enrichment.status).toBe("partial");
    expect(enriched.enrichment.errors).toHaveLength(1);
    expect(enriched.results[0]?.hops[0]?.enrichmentError).toContain("nxtrace batch failed");
    expect(enriched.results[0]?.hops[1]?.enrichmentError).toContain("nxtrace batch failed");
  });

  it("uses cached GeoIP data without issuing another nxtrace request", async () => {
    const cache = new MemoryCache();
    const trace = sampleTrace(2);
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const ips = JSON.parse(String(init?.body)).ips as string[];
      return new Response(
        JSON.stringify({
          results: ips.map((ip) => ({ ip, ok: true, data: geo(ip) })),
        }),
      );
    }) as unknown as typeof fetch;

    await enrichTraceResponse(trace, { apiBase: "https://nxtrace.test", token: "secret", cache, fetcher });
    const cached = await enrichTraceResponse(trace, {
      apiBase: "https://nxtrace.test",
      token: "secret",
      cache,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cached.enrichment.cached).toBe(2);
    expect(cached.enrichment.fetched).toBe(0);
  });

  it("does not send private or invalid hop addresses to nxtrace", () => {
    const hops: TraceHop[] = [
      hop("10.0.0.1"),
      hop("192.168.1.1"),
      hop("203.0.113.9"),
      hop("2001:db8::1"),
      hop("8.8.8.8"),
      hop(null),
    ];
    expect(uniquePublicHopIps(hops)).toEqual(["8.8.8.8"]);
    expect(hops[0]?.privateAddress).toBe(true);
    expect(hops[2]?.privateAddress).toBe(true);
  });

  it("classifies IPv4 and IPv6 public boundaries before enrichment", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("100.128.0.1")).toBe(true);
    expect(isPublicIp("172.15.255.255")).toBe(true);
    expect(isPublicIp("172.32.0.0")).toBe(true);
    expect(isPublicIp("2001:4860:4860::8888")).toBe(true);
    expect(isPublicIp("::ffff:8.8.8.8")).toBe(true);

    expect(isPublicIp("0.0.0.0")).toBe(false);
    expect(isPublicIp("10.0.0.1")).toBe(false);
    expect(isPublicIp("100.64.0.1")).toBe(false);
    expect(isPublicIp("100.127.255.255")).toBe(false);
    expect(isPublicIp("172.16.0.0")).toBe(false);
    expect(isPublicIp("172.31.255.255")).toBe(false);
    expect(isPublicIp("192.0.2.1")).toBe(false);
    expect(isPublicIp("198.18.0.1")).toBe(false);
    expect(isPublicIp("198.51.100.10")).toBe(false);
    expect(isPublicIp("203.0.113.9")).toBe(false);
    expect(isPublicIp("224.0.0.1")).toBe(false);
    expect(isPublicIp("255.255.255.255")).toBe(false);
    expect(isPublicIp("::")).toBe(false);
    expect(isPublicIp("::1")).toBe(false);
    expect(isPublicIp("fe80::1")).toBe(false);
    expect(isPublicIp("fc00::1")).toBe(false);
    expect(isPublicIp("fd12::1")).toBe(false);
    expect(isPublicIp("ff02::1")).toBe(false);
    expect(isPublicIp("2001:db8::1")).toBe(false);
    expect(isPublicIp("::ffff:192.168.1.1")).toBe(false);
    expect(isPublicIp("::ffff:203.0.113.9")).toBe(false);
  });

  it("skips enrichment when a finished trace only has private hop addresses", async () => {
    const trace = sampleTrace(0);
    trace.results[0].hops = [hop("10.0.0.1"), hop("192.168.1.1")];
    const fetcher = vi.fn() as unknown as typeof fetch;

    const enriched = await enrichTraceResponse(trace, { token: "secret", fetcher });

    expect(enriched.enrichment.status).toBe("skipped");
    expect(enriched.enrichment.errors).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(enriched.results[0]?.hops[0]?.privateAddress).toBe(true);
  });

  it("marks the batch as skipped when the token is missing", async () => {
    const enriched = await enrichTraceResponse(sampleTrace(1), {});
    expect(enriched.enrichment.status).toBe("skipped");
    expect(enriched.results[0]?.hops[0]?.enrichmentError).toContain("NXTRACE_API_V4_TOKEN");
  });
});

function sampleTrace(count: number): TraceResultResponse {
  return {
    measurementId: "m123",
    type: "mtr",
    target: "example.com",
    status: "finished",
    probesCount: 1,
    results: [
      {
        id: "probe-1",
        probe: {
          continent: "NA",
          region: "Northern America",
          country: "US",
          state: "CA",
          city: "Los Angeles",
          asn: 7922,
          latitude: 34,
          longitude: -118,
          network: "Comcast",
          tags: ["eyeball-network"],
          resolvers: [],
        },
        status: "finished",
        resolvedAddress: "203.0.113.1",
        resolvedHostname: null,
        rawOutput: "raw",
        hops: Array.from({ length: count }, (_, index) => hop(`8.8.${Math.floor(index / 255)}.${index % 255}`)),
      },
    ],
    enrichment: { status: "skipped", cached: 0, fetched: 0, errors: [] },
  };
}

function hop(ip: string | null): TraceHop {
  return {
    ttl: 1,
    ip,
    hostname: null,
    asn: [],
    timingsMs: [1],
    stats: { min: 1, avg: 1, max: 1, total: 1, rcv: 1, drop: 0, loss: 0 },
  };
}

function geo(ip: string): NxtraceGeo {
  return {
    ip,
    asnumber: "AS15169",
    owner: "Google LLC",
    country_en: "United States",
    city_en: "Mountain View",
    source: "mock",
  };
}
