import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAP_STYLE_URL } from "../shared/types";
import { createApp, handleRequest } from "./app";
import type { WorkerEnv } from "./env";

const env: WorkerEnv = {
  ASSETS: { fetch: vi.fn() } as unknown as Fetcher,
  APP_ENV: "development",
  GLOBALPING_API_BASE: "https://globalping.test",
  NXTRACE_API_BASE: "https://nxtrace.test",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("worker API", () => {
  it("returns runtime config defaults and env overrides", async () => {
    const app = createApp();

    const defaults = await app.fetch(new Request("https://globaltrace.test/api/config"), env);
    const configured = await app.fetch(new Request("https://globaltrace.test/api/config"), {
      ...env,
      MAP_STYLE_URL: "https://tiles.example.com/style.json",
      TURNSTILE_SITE_KEY: "site-key",
    });

    await expect(defaults.json()).resolves.toEqual({ turnstileSiteKey: "", mapStyleUrl: DEFAULT_MAP_STYLE_URL });
    await expect(configured.json()).resolves.toEqual({
      turnstileSiteKey: "site-key",
      mapStyleUrl: "https://tiles.example.com/style.json",
    });
  });

  it("rejects invalid JSON bodies", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: "{",
      }),
      env,
    );
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("invalid json body");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized enrich bodies before parsing JSON", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: "x".repeat(256_001),
      }),
      env,
    );
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("request body is too large");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid uploaded measurements before enrichment", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({ measurement: { id: "m123", type: "ping", status: "finished", target: "example.com", probesCount: 1 } }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects uploaded measurements with invalid IDs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const measurement = finishedMeasurement();
    measurement.id = "bad/id";

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({ measurement }),
      }),
      env,
    );
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("measurement.id is invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects uploaded measurements above the app probe cap", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({
          measurement: {
            id: "m123",
            type: "mtr",
            status: "finished",
            target: "example.com",
            probesCount: 11,
            results: [],
          },
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects uploaded measurements with oversized raw output or hop arrays", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const rawOutputMeasurement = finishedMeasurement();
    rawOutputMeasurement.results[0].result.rawOutput = "x".repeat(20_001);
    const hopsMeasurement = finishedMeasurement();
    hopsMeasurement.results[0].result.hops = Array.from({ length: 65 }, () => ({
      resolvedAddress: "8.8.8.8",
      resolvedHostname: "dns.google",
      asn: [15169],
      timings: [{ rtt: 1 }],
      stats: { min: 1, avg: 1, max: 1, total: 1, rcv: 1, drop: 0, loss: 0 },
    }));

    const rawOutputResponse = await app.fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({ measurement: rawOutputMeasurement }),
      }),
      env,
    );
    const hopsResponse = await app.fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({ measurement: hopsMeasurement }),
      }),
      env,
    );

    await expect(rawOutputResponse.json()).resolves.toMatchObject({
      error: { message: "result.rawOutput must contain at most 20000 characters" },
    });
    await expect(hopsResponse.json()).resolves.toMatchObject({
      error: { message: "result.hops must contain at most 64 items" },
    });
    expect(rawOutputResponse.status).toBe(400);
    expect(hopsResponse.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables server-side Globalping create and limits proxy routes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const createResponse = await app.fetch(
      new Request("https://globaltrace.test/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "globalping.io" }),
      }),
      env,
    );
    const limitsResponse = await app.fetch(new Request("https://globaltrace.test/api/limits"), env);

    expect(createResponse.status).toBe(404);
    expect(limitsResponse.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns in-progress uploaded measurements without nxtrace enrichment", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurement: inProgressMeasurement() }),
      }),
      env,
    );
    const body = (await response.json()) as {
      status: string;
      enrichment: { status: string };
    };

    expect(response.status).toBe(200);
    expect(body.status).toBe("in-progress");
    expect(body.enrichment.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches public probe lists with a short TTL", async () => {
    const cache = new MemoryCache();
    vi.stubGlobal("caches", { default: cache });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([sampleProbe()])));
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const first = await app.fetch(new Request("https://globaltrace.test/api/probes"), env);
    const firstBody = (await first.json()) as { fetchedAt: string; probes: unknown[] };
    const second = await app.fetch(new Request("https://globaltrace.test/api/probes"), env);
    const secondBody = (await second.json()) as { fetchedAt: string; probes: unknown[] };
    const head = await app.fetch(new Request("https://globaltrace.test/api/probes", { method: "HEAD" }), env);

    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("public, max-age=180");
    expect(second.headers.get("Cache-Control")).toBe("public, max-age=180");
    expect(firstBody.probes).toHaveLength(1);
    expect(secondBody.fetchedAt).toBe(firstBody.fetchedAt);
    expect(head.status).toBe(200);
    expect(head.headers.get("Cache-Control")).toBe("public, max-age=180");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps non-finished uploaded measurement statuses to error responses", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          measurement: {
            id: "m-error",
            type: "mtr",
            status: "failed",
            target: "example.com",
            probesCount: 1,
            results: [],
          },
        }),
      }),
      env,
    );
    const body = (await response.json()) as { status: string; enrichment: { status: string } };

    expect(response.status).toBe(200);
    expect(body.status).toBe("error");
    expect(body.enrichment.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns empty cache misses without fetching Globalping server-side", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(new Request("https://globaltrace.test/api/trace/m-miss"), env);

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches finished enriched trace responses by measurement ID", async () => {
    const cache = new MemoryCache();
    vi.stubGlobal("caches", { default: cache });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ ip: "8.8.8.8", ok: true, data: { ip: "8.8.8.8", source: "mock" } }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const envWithToken = { ...env, NXTRACE_API_V4_TOKEN: "secret" };

    const first = await app.fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurement: finishedMeasurement() }),
      }),
      envWithToken,
    );
    const second = await app.fetch(new Request("https://globaltrace.test/api/trace/m-cache"), envWithToken);
    const cachedBody = (await second.json()) as { measurementId: string; enrichment: { fetched: number } };

    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("public, max-age=120");
    expect(cachedBody.measurementId).toBe("m-cache");
    expect(cachedBody.enrichment.fetched).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("verifies Turnstile when a production secret is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/turnstile/verify", {
        method: "POST",
        body: JSON.stringify({ token: "bad-token" }),
      }),
      { ...env, APP_ENV: "production", TURNSTILE_SECRET_KEY: "secret" },
    );
    const body = (await response.json()) as {
      success: boolean;
      errorCodes: string[];
    };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errorCodes).toEqual(["invalid-input-response"]);
  });

  it("accepts a successful Turnstile verification result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })),
    );

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/turnstile/verify", {
        method: "POST",
        body: JSON.stringify({ token: "ok-token" }),
      }),
      { ...env, APP_ENV: "production", TURNSTILE_SECRET_KEY: "secret" },
    );
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("serves static assets outside API routes", async () => {
    const assetsFetch = vi.fn().mockResolvedValue(new Response("asset response"));
    const request = new Request("https://globaltrace.test/");

    const response = await handleRequest(request, {
      ...env,
      ASSETS: { fetch: assetsFetch } as unknown as Fetcher,
    });

    await expect(response.text()).resolves.toBe("asset response");
    expect(assetsFetch).toHaveBeenCalledWith(request);
  });
});

class MemoryCache {
  private readonly store = new Map<string, Response>();

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const key = request instanceof Request ? request.url : String(request);
    return this.store.get(key)?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    const key = request instanceof Request ? request.url : String(request);
    this.store.set(key, response.clone());
  }
}

function inProgressMeasurement() {
  return {
    id: "m123",
    type: "mtr",
    status: "in-progress",
    target: "example.com",
    probesCount: 1,
    results: [],
  };
}

function finishedMeasurement() {
  return {
    id: "m-cache",
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
              stats: { min: 1, avg: 1.2, max: 2, total: 1, rcv: 1, drop: 0, loss: 0 },
            },
          ],
        },
      },
    ],
  };
}

function sampleProbe() {
  return {
    location: {
      continent: "NA",
      region: "Northern America",
      country: "US",
      state: "CA",
      city: "Los Angeles",
      asn: 7922,
      latitude: 34.05,
      longitude: -118.24,
      network: "Comcast",
    },
    tags: ["eyeball-network"],
    resolvers: [],
  };
}
