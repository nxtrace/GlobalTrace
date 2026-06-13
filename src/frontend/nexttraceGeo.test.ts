import { beforeEach, describe, expect, it, vi } from "vitest";
import { enrichTraceWithNexttraceToken } from "./nexttraceGeo";
import type { TraceHop, TraceResultResponse } from "../shared/types";

const NEXTTRACE_GEO_CACHE_PREFIX = "globaltrace.nexttraceGeo.v1:";

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
});

describe("browser NextTrace enrichment", () => {
  it("chunks public hop IPs at 16 and sends only browser-safe headers", async () => {
    const trace = sampleTrace(Array.from({ length: 65 }, (_, index) => hop(`8.8.8.${index + 1}`)));
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.nxtrace.org/v4/ipGeo/batch");
      expect(init?.headers).toEqual({
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-NextTrace-Token": "nt-token",
      });
      expect(JSON.stringify(init?.headers)).not.toContain("User-Agent");
      const ips = JSON.parse(String(init?.body)).ips as string[];
      return json({
        results: ips.map((ip) => ({ ip, ok: true, data: { ip, asnumber: "AS15169", source: "nexttrace" } })),
      });
    }) as unknown as typeof fetch;

    const enriched = await enrichTraceWithNexttraceToken(trace, " nt-token ", { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(enriched.enrichment).toEqual({ status: "complete", cached: 0, fetched: 65, errors: [] });
    expect(enriched.results[0]?.hops[0]?.geo?.source).toBe("nexttrace");
  });

  it("splits retryable failed batches so successful halves are not polluted", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const ips = JSON.parse(String(init?.body)).ips as string[];
      if (ips.length === 4) return json({ error: "bad gateway" }, 504);
      return json({
        results: ips.map((ip) => ({ ip, ok: true, data: { ip, asnumber: "AS15169", source: "nexttrace" } })),
      });
    }) as unknown as typeof fetch;

    const enriched = await enrichTraceWithNexttraceToken(
      sampleTrace(["8.8.0.0", "8.8.0.1", "8.8.0.2", "8.8.0.3"].map((ip) => hop(ip))),
      "nt-token",
      { fetcher },
    );

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(enriched.enrichment).toEqual({ status: "complete", cached: 0, fetched: 4, errors: [] });
    expect(enriched.results[0]?.hops.map((hop) => hop.geo?.ip)).toEqual(["8.8.0.0", "8.8.0.1", "8.8.0.2", "8.8.0.3"]);
  });

  it("reports only the single IP that still fails after split retries", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const ips = JSON.parse(String(init?.body)).ips as string[];
      if (ips.length > 1 || ips[0] === "8.8.0.1") return json({ error: "bad gateway" }, 504);
      return json({
        results: ips.map((ip) => ({ ip, ok: true, data: { ip, asnumber: "AS15169", source: "nexttrace" } })),
      });
    }) as unknown as typeof fetch;

    const enriched = await enrichTraceWithNexttraceToken(sampleTrace([hop("8.8.0.0"), hop("8.8.0.1")]), "nt-token", {
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(enriched.enrichment.status).toBe("partial");
    expect(enriched.enrichment.errors).toEqual([{ ips: ["8.8.0.1"], message: "nexttrace batch failed with HTTP 504" }]);
    expect(enriched.results[0]?.hops[0]?.geo?.ip).toBe("8.8.0.0");
    expect(enriched.results[0]?.hops[1]?.enrichmentError).toContain("nexttrace batch failed");
  });

  it("caches successful batch results in localStorage", async () => {
    const fetcher = vi.fn(async () =>
      json({
        results: [{ ip: "8.8.8.8", ok: true, data: { ip: "8.8.8.8", asnumber: "AS15169", source: "nexttrace" } }],
      }),
    ) as unknown as typeof fetch;

    const first = await enrichTraceWithNexttraceToken(sampleTrace([hop("8.8.8.8")]), "nt-token", { fetcher });
    const second = await enrichTraceWithNexttraceToken(sampleTrace([hop("8.8.8.8")]), "nt-token", { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.enrichment).toEqual({ status: "complete", cached: 0, fetched: 1, errors: [] });
    expect(second.enrichment).toEqual({ status: "complete", cached: 1, fetched: 0, errors: [] });
    expect(second.results[0]?.hops[0]?.geo?.source).toBe("nexttrace");
  });

  it("ignores expired and malformed local cache entries", async () => {
    window.localStorage.setItem(
      cacheKey("8.8.8.8"),
      JSON.stringify({ expiresAt: Date.now() - 1, geo: { ip: "8.8.8.8", source: "stale-nexttrace" } }),
    );
    window.localStorage.setItem(cacheKey("1.1.1.1"), "not-json");
    window.localStorage.setItem(
      cacheKey("9.9.9.9"),
      JSON.stringify({ expiresAt: Date.now() + 60_000, geo: { ip: "8.8.4.4", source: "wrong-ip" } }),
    );
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const ips = JSON.parse(String(init?.body)).ips as string[];
      return json({
        results: ips.map((ip) => ({ ip, ok: true, data: { ip, asnumber: "AS15169", source: "fresh-nexttrace" } })),
      });
    }) as unknown as typeof fetch;

    const enriched = await enrichTraceWithNexttraceToken(
      sampleTrace([hop("8.8.8.8"), hop("1.1.1.1"), hop("9.9.9.9")]),
      "nt-token",
      { fetcher },
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(fetcher).mock.calls[0]?.[1]?.body)).ips).toEqual(["8.8.8.8", "1.1.1.1", "9.9.9.9"]);
    expect(enriched.enrichment).toEqual({ status: "complete", cached: 0, fetched: 3, errors: [] });
    expect(enriched.results[0]?.hops.map((hop) => hop.geo?.source)).toEqual([
      "fresh-nexttrace",
      "fresh-nexttrace",
      "fresh-nexttrace",
    ]);
  });

  it("skips private and invalid hop addresses without external requests", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;

    const enriched = await enrichTraceWithNexttraceToken(sampleTrace([hop("10.0.0.1"), hop("203.0.113.9"), hop(null)]), "nt-token", {
      fetcher,
    });

    expect(enriched.enrichment.status).toBe("skipped");
    expect(enriched.results[0]?.hops[0]?.privateAddress).toBe(true);
    expect(enriched.results[0]?.hops[1]?.privateAddress).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps the trace displayable when a batch request fails", async () => {
    const fetcher = vi.fn(async () => json({ error: { message: "bad token" } }, 403)) as unknown as typeof fetch;

    const enriched = await enrichTraceWithNexttraceToken(sampleTrace([hop("8.8.8.8")]), "nt-token", { fetcher });

    expect(enriched.enrichment.status).toBe("partial");
    expect(enriched.enrichment.errors[0]?.message).toContain("nexttrace batch failed with HTTP 403");
    expect(enriched.results[0]?.hops[0]?.enrichmentError).toContain("nexttrace batch failed");
  });
});

function sampleTrace(hops: TraceHop[]): TraceResultResponse {
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
          latitude: 34.05,
          longitude: -118.24,
          network: "Comcast",
          tags: [],
          resolvers: [],
        },
        status: "finished",
        resolvedAddress: "8.8.8.8",
        resolvedHostname: null,
        hops,
        rawOutput: "raw",
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cacheKey(ip: string): string {
  return `${NEXTTRACE_GEO_CACHE_PREFIX}${ip}`;
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, String(value)),
  };
}
