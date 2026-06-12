import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTrace,
  enrichTrace,
  fetchCachedTrace,
  fetchConfig,
  fetchGlobalpingMeasurement,
  fetchLimits,
} from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("frontend api helpers", () => {
  it("fetches runtime config as JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ mapStyleUrl: "about:blank" })),
      ),
    );

    await expect(fetchConfig()).resolves.toEqual({ mapStyleUrl: "about:blank" });
    expect(fetch).toHaveBeenCalledWith("/api/config", expect.objectContaining({ headers: expect.any(Object) }));
  });

  it("creates traces directly through the Globalping API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "m123", probesCount: 1 }), {
          status: 202,
          headers: { Location: "https://api.globalping.io/v1/measurements/m123" },
        }),
      ),
    );

    await expect(createTrace({ target: "example.com", limit: 1 })).resolves.toMatchObject({
      measurementId: "m123",
      location: "https://api.globalping.io/v1/measurements/m123",
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.globalping.io/v1/measurements");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      type: "mtr",
      target: "example.com",
      limit: 1,
      measurementOptions: { protocol: "ICMP", packets: 3 },
    });
  });

  it("enriches completed Globalping measurements through the local Worker", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            measurementId: "m123",
            type: "mtr",
            target: "example.com",
            status: "finished",
            probesCount: 0,
            results: [],
            enrichment: { status: "complete", cached: 0, fetched: 0, errors: [] },
          }),
        ),
      ),
    );

    await expect(enrichTrace("m123", controller.signal)).resolves.toMatchObject({ measurementId: "m123" });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBe(controller.signal);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/trace/enrich");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      measurementId: "m123",
    });
  });

  it("sends Globalping tokens directly to Globalping for limits and trace creation", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              rateLimit: { measurements: { create: { type: "user", limit: 500, remaining: 499, reset: 60 } } },
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: "m123", probesCount: 1 }), { status: 202 }),
        ),
    );

    await fetchLimits(" gp-token ");
    await createTrace({ target: "example.com", limit: 1 }, " gp-token ");

    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer gp-token" }),
    );
    expect(vi.mocked(fetch).mock.calls[1][1]?.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer gp-token" }),
    );
  });

  it("encodes measurement IDs when fetching direct Globalping measurements and local cache", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "m 1", type: "mtr", target: "example.com", status: "in-progress", probesCount: 0 })))
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );

    await fetchGlobalpingMeasurement("m 1", "", controller.signal);
    await expect(fetchCachedTrace("m 1", controller.signal)).resolves.toBeNull();

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://api.globalping.io/v1/measurements/m%201");
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe("/api/trace/m%201");
    expect(vi.mocked(fetch).mock.calls[1][1]?.signal).toBe(controller.signal);
  });

  it("throws API error messages from non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Globalping measurement fetch failed with HTTP 404" } }), { status: 502 }),
      ),
    );

    await expect(enrichTrace("missing")).rejects.toThrow("Globalping measurement fetch failed with HTTP 404");
  });

  it("falls back to HTTP status when error bodies are not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 502 })));

    await expect(fetchConfig()).rejects.toThrow("HTTP 502");
  });
});
