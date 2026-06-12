import { describe, expect, it, vi } from "vitest";
import { enrichTraceWithBrowserFallback } from "./fallbackGeo";
import type { TraceHop, TraceResultResponse } from "../shared/types";

describe("browser GeoIP fallback", () => {
  it("maps IPinfo geolocation and org fields without calling RIPEstat when ASN is present", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://ipinfo.io/8.8.8.8");
      return json({
        ip: "8.8.8.8",
        city: "Mountain View",
        region: "California",
        country: "US",
        loc: "37.4056,-122.0775",
        org: "AS15169 Google LLC",
      });
    }) as unknown as typeof fetch;

    const enriched = await enrichTraceWithBrowserFallback(sampleTrace([hop("8.8.8.8")]), { fetcher });
    const geo = enriched.results[0]?.hops[0]?.geo;

    expect(enriched.enrichment).toEqual({ status: "complete", cached: 0, fetched: 1, errors: [] });
    expect(geo).toMatchObject({
      ip: "8.8.8.8",
      asnumber: "AS15169",
      owner: "Google LLC",
      country: "US",
      prov: "California",
      city: "Mountain View",
      lat: 37.4056,
      lng: -122.0775,
      source: "ipinfo",
    });
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(1);
  });

  it("uses RIPEstat prefix overview when IPinfo has no ASN", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "https://ipinfo.io/206.83.141.0") {
        return json({
          ip: "206.83.141.0",
          city: "Englewood",
          region: "Colorado",
          country: "US",
          loc: "39.6123,-104.8799",
        });
      }
      if (path.startsWith("https://stat.ripe.net/data/prefix-overview/data.json")) {
        expect(new URL(path).searchParams.get("resource")).toBe("206.83.141.0");
        return json({
          status: "ok",
          data: {
            resource: "206.83.141.0/24",
            asns: [{ asn: 64500, holder: "EXAMPLE - Example Network" }],
          },
        });
      }
      throw new Error(`unexpected fetch: ${path}`);
    }) as unknown as typeof fetch;

    const enriched = await enrichTraceWithBrowserFallback(sampleTrace([hop("206.83.141.0")]), { fetcher });
    const geo = enriched.results[0]?.hops[0]?.geo;

    expect(enriched.enrichment).toEqual({ status: "complete", cached: 0, fetched: 1, errors: [] });
    expect(geo).toMatchObject({
      asnumber: "AS64500",
      owner: "EXAMPLE - Example Network",
      prefix: "206.83.141.0/24",
      source: "ipinfo+RIPEstat",
    });
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(2);
  });

  it("skips private and invalid hop addresses without external requests", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;

    const enriched = await enrichTraceWithBrowserFallback(sampleTrace([hop("10.0.0.1"), hop("203.0.113.9"), hop(null)]), {
      fetcher,
    });

    expect(enriched.enrichment.status).toBe("skipped");
    expect(enriched.results[0]?.hops[0]?.privateAddress).toBe(true);
    expect(enriched.results[0]?.hops[1]?.privateAddress).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps the trace displayable when one public IP lookup fails", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "https://ipinfo.io/8.8.8.8") {
        return json({ ip: "8.8.8.8", loc: "37.4056,-122.0775", org: "AS15169 Google LLC" });
      }
      if (path === "https://ipinfo.io/1.1.1.1") {
        return json({ error: true }, 429);
      }
      throw new Error(`unexpected fetch: ${path}`);
    }) as unknown as typeof fetch;

    const enriched = await enrichTraceWithBrowserFallback(sampleTrace([hop("8.8.8.8"), hop("1.1.1.1")]), { fetcher });

    expect(enriched.enrichment.status).toBe("partial");
    expect(enriched.enrichment.fetched).toBe(1);
    expect(enriched.enrichment.errors).toHaveLength(1);
    expect(enriched.results[0]?.hops[0]?.geo?.asnumber).toBe("AS15169");
    expect(enriched.results[0]?.hops[1]?.enrichmentError).toContain("ipinfo lookup failed");
  });

  it("returns partial enrichment when RIPEstat fails after IPinfo succeeds", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "https://ipinfo.io/206.83.141.0") {
        return json({ ip: "206.83.141.0", city: "Englewood", loc: "39.6123,-104.8799" });
      }
      if (path.startsWith("https://stat.ripe.net/data/prefix-overview/data.json")) {
        return json({ status: "error" }, 502);
      }
      throw new Error(`unexpected fetch: ${path}`);
    }) as unknown as typeof fetch;

    const enriched = await enrichTraceWithBrowserFallback(sampleTrace([hop("206.83.141.0")]), { fetcher });

    expect(enriched.enrichment.status).toBe("partial");
    expect(enriched.enrichment.fetched).toBe(1);
    expect(enriched.enrichment.errors[0]?.message).toContain("RIPEstat prefix overview failed");
    expect(enriched.results[0]?.hops[0]?.geo?.city).toBe("Englewood");
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
