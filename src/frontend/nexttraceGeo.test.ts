import { describe, expect, it, vi } from "vitest";
import { enrichTraceWithNexttraceToken } from "./nexttraceGeo";
import type { TraceHop, TraceResultResponse } from "../shared/types";

describe("browser NextTrace enrichment", () => {
  it("chunks public hop IPs at 64 and sends only browser-safe headers", async () => {
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

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(enriched.enrichment).toEqual({ status: "complete", cached: 0, fetched: 65, errors: [] });
    expect(enriched.results[0]?.hops[0]?.geo?.source).toBe("nexttrace");
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
