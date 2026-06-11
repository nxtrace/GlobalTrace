import { describe, expect, it } from "vitest";
import { measurementToTraceResponse } from "./transform";
import type { GlobalpingMeasurement } from "./globalping";

describe("Globalping measurement transform", () => {
  it("maps finished MTR results into shared trace responses", () => {
    const trace = measurementToTraceResponse({
      id: "m123",
      type: "mtr",
      status: "finished",
      target: "example.com",
      probesCount: 1,
      results: [
        {
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
            tags: ["eyeball-network"],
            resolvers: [],
          },
          result: {
            status: "finished",
            rawOutput: "raw",
            resolvedAddress: "8.8.8.8",
            resolvedHostname: "dns.google",
            hops: [
              {
                resolvedAddress: "8.8.8.8",
                resolvedHostname: "dns.google",
                asn: [15169],
                timings: [{ rtt: 1.2 }],
                stats: { min: 1, avg: 1.2, max: 2, total: 2, rcv: 2, drop: 0, loss: 0 },
              },
            ],
          },
        },
      ],
    });

    expect(trace.status).toBe("finished");
    expect(trace.results[0]?.hops[0]).toMatchObject({
      ttl: 1,
      ip: "8.8.8.8",
      hostname: "dns.google",
      asn: [15169],
      timingsMs: [1.2],
      stats: { avg: 1.2, total: 2 },
    });
  });

  it("keeps in-progress measurements unenriched with empty results by default", () => {
    const trace = measurementToTraceResponse(baseMeasurement("in-progress"));

    expect(trace.status).toBe("in-progress");
    expect(trace.results).toEqual([]);
    expect(trace.enrichment.status).toBe("skipped");
  });

  it("maps unknown Globalping statuses to error", () => {
    const trace = measurementToTraceResponse(baseMeasurement("failed"));

    expect(trace.status).toBe("error");
  });
});

function baseMeasurement(status: string): GlobalpingMeasurement {
  return {
    id: `m-${status}`,
    type: "mtr",
    status,
    target: "example.com",
    probesCount: 0,
    results: [],
  };
}
