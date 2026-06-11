import { describe, expect, it, vi } from "vitest";
import { GlobalpingClient, toGlobalpingMeasurementRequest, validateTraceCreate } from "./globalping";

describe("Globalping client and validation", () => {
  it("validates protocol, port, packets, ip version, and probe limits", () => {
    expect(() => validateTraceCreate({ target: "example.com", protocol: "TCP", port: 443 })).not.toThrow();
    expect(() => validateTraceCreate({ target: "example.com", protocol: "HTTP" as never })).toThrow(
      "protocol must be ICMP, TCP, or UDP",
    );
    expect(() => validateTraceCreate({ target: "example.com", port: 70000 })).toThrow("port must be within range");
    expect(() => validateTraceCreate({ target: "example.com", packets: 0 })).toThrow("packets must be within range");
    expect(() => validateTraceCreate({ target: "example.com", ipVersion: 5 as never })).toThrow(
      "ipVersion must be 4 or 6",
    );
    expect(() => validateTraceCreate({ target: "example.com", limit: 11 })).toThrow("limit must be within range");
  });

  it("builds a fixed MTR measurement request", () => {
    const input = validateTraceCreate({
      target: "example.com",
      protocol: "TCP",
      port: 443,
      packets: 2,
      ipVersion: 4,
      limit: 2,
      filters: { magic: "US+Comcast, DE+Hetzner" },
    });

    expect(toGlobalpingMeasurementRequest(input)).toEqual({
      type: "mtr",
      target: "example.com",
      locations: [{ magic: "US+Comcast" }, { magic: "DE+Hetzner" }],
      limit: 2,
      inProgressUpdates: true,
      measurementOptions: {
        protocol: "TCP",
        packets: 2,
        port: 443,
        ipVersion: 4,
      },
    });
  });

  it("omits ipVersion from measurementOptions when automatic mode is used", () => {
    const input = validateTraceCreate({ target: "example.com" });

    expect(toGlobalpingMeasurementRequest(input)).toEqual({
      type: "mtr",
      target: "example.com",
      locations: [{ magic: "world" }],
      limit: 3,
      inProgressUpdates: true,
      measurementOptions: {
        protocol: "ICMP",
        packets: 3,
      },
    });
  });

  it("lists probes from the Globalping API", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ location: {}, tags: [] }])));
    const client = new GlobalpingClient({ baseUrl: "https://globalping.test", fetcher });

    await expect(client.listProbes()).resolves.toEqual([{ location: {}, tags: [] }]);
    expect(fetcher.mock.calls[0][0]).toBe("https://globalping.test/v1/probes");
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
  });
});
