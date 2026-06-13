import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAP_STYLE_URL } from "../shared/types";
import { createApp, handleRequest } from "./app";
import type { WorkerEnv } from "./env";
import { SECURITY_HEADERS } from "./http";

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
    });

    await expect(defaults.json()).resolves.toEqual({ mapStyleUrl: DEFAULT_MAP_STYLE_URL });
    await expect(configured.json()).resolves.toEqual({
      mapStyleUrl: "https://tiles.example.com/style.json",
    });
    expect(defaults.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(defaults.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expectSecurityHeaders(defaults.headers);
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

  it("rejects streamed oversized enrich bodies without Content-Length", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(256_001)));
        controller.close();
      },
    });

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: stream,
        duplex: "half",
      } as RequestInit),
      env,
    );
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("request body is too large");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-site enrich requests before fetching Globalping", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.test",
          "Sec-Fetch-Site": "cross-site",
        },
        body: JSON.stringify({ measurementId: "m123" }),
      }),
      env,
    );
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(403);
    expect(body.error.message).toBe("cross-site requests are not allowed");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing measurement IDs before fetching Globalping", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      env,
    );
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("measurementId is invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-object enrich bodies before fetching Globalping", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: "null",
      }),
      env,
    );
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("request body is invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid measurement IDs before fetching Globalping", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({ measurementId: "bad/id" }),
      }),
      env,
    );
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("measurementId is invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-MTR measurements returned by Globalping", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "m123", type: "ping", status: "finished", target: "example.com", probesCount: 1 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({ measurementId: "m123" }),
      }),
      env,
    );
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("measurement.type must be mtr");
    expect(fetchMock).toHaveBeenCalledWith("https://globalping.test/v1/measurements/m123", expect.any(Object));
  });

  it("rejects Globalping measurements above the app probe cap", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "m123",
          type: "mtr",
          status: "finished",
          target: "example.com",
          probesCount: 11,
          results: [],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({ measurementId: "m123" }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "measurement.probesCount must be within range 0-10" },
    });
  });

  it("rejects Globalping measurements with oversized raw output or hop arrays", async () => {
    const rawOutputMeasurement = finishedMeasurement("m-raw");
    rawOutputMeasurement.results[0].result.rawOutput = "x".repeat(20_001);
    const hopsMeasurement = finishedMeasurement("m-hops");
    hopsMeasurement.results[0].result.hops = Array.from({ length: 65 }, () => ({
      resolvedAddress: "8.8.8.8",
      resolvedHostname: "dns.google",
      asn: [15169],
      timings: [{ rtt: 1 }],
      stats: { min: 1, avg: 1, max: 1, total: 1, rcv: 1, drop: 0, loss: 0 },
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(rawOutputMeasurement)))
      .mockResolvedValueOnce(new Response(JSON.stringify(hopsMeasurement)));
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const rawOutputResponse = await app.fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({ measurementId: "m-raw" }),
      }),
      env,
    );
    const hopsResponse = await app.fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({ measurementId: "m-hops" }),
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it("returns in-progress Globalping measurements without nxtrace enrichment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(inProgressMeasurement())));
    vi.stubGlobal("fetch", fetchMock);
    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurementId: "m123" }),
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches public probe lists with a short TTL", async () => {
    const cache = new MemoryCache();
    vi.stubGlobal("caches", { default: cache });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([sampleProbe()])));
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const execution = createExecutionContext();

    const first = await app.fetch(new Request("https://globaltrace.test/api/probes"), env, execution.ctx);
    const firstBody = (await first.json()) as { fetchedAt: string; probes: unknown[] };
    await Promise.all(execution.promises);
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
    expect(execution.ctx.waitUntil).toHaveBeenCalledTimes(1);
  });

  it("maps non-finished Globalping measurement statuses to error responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "m-error",
          type: "mtr",
          status: "failed",
          target: "example.com",
          probesCount: 1,
          results: [],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurementId: "m-error" }),
      }),
      env,
    );
    const body = (await response.json()) as { status: string; enrichment: { status: string } };

    expect(response.status).toBe(200);
    expect(body.status).toBe("error");
    expect(body.enrichment.status).toBe("skipped");
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(finishedMeasurement())))
      .mockResolvedValueOnce(
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
        body: JSON.stringify({ measurementId: "m-cache" }),
      }),
      envWithToken,
    );
    const second = await app.fetch(new Request("https://globaltrace.test/api/trace/m-cache"), envWithToken);
    const third = await app.fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurementId: "m-cache" }),
      }),
      envWithToken,
    );
    const cachedBody = (await second.json()) as { measurementId: string; enrichment: { fetched: number } };
    const postCachedBody = (await third.json()) as { measurementId: string; enrichment: { fetched: number } };

    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("public, max-age=604800");
    expect(cachedBody.measurementId).toBe("m-cache");
    expect(cachedBody.enrichment.fetched).toBe(1);
    expect(postCachedBody.measurementId).toBe("m-cache");
    expect(postCachedBody.enrichment.fetched).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache partial enriched trace responses", async () => {
    const cache = new MemoryCache();
    vi.stubGlobal("caches", { default: cache });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(finishedMeasurement("m-partial"))))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "gateway timeout" }), { status: 504 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(finishedMeasurement("m-partial"))))
      .mockResolvedValueOnce(
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
        body: JSON.stringify({ measurementId: "m-partial" }),
      }),
      envWithToken,
    );
    const second = await app.fetch(new Request("https://globaltrace.test/api/trace/m-partial"), envWithToken);
    const third = await app.fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurementId: "m-partial" }),
      }),
      envWithToken,
    );
    const firstBody = (await first.json()) as { enrichment: { status: string } };
    const thirdBody = (await third.json()) as { enrichment: { status: string; fetched: number } };

    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(firstBody.enrichment.status).toBe("partial");
    expect(second.status).toBe(204);
    expect(third.headers.get("Cache-Control")).toBe("public, max-age=604800");
    expect(thirdBody.enrichment).toMatchObject({ status: "complete", fetched: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([404, 429, 503])("surfaces Globalping measurement fetch HTTP %s failures", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "upstream error" }), { status }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({ measurementId: "missing" }),
      }),
      env,
    );
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(502);
    expect(body.error.message).toBe(`Globalping measurement fetch failed with HTTP ${status}`);
    expect(fetchMock).toHaveBeenCalledWith("https://globalping.test/v1/measurements/missing", expect.any(Object));
  });

  it("uses the Globalping result instead of any forged client measurement body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(finishedMeasurement("m-trusted"))))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ results: [{ ip: "8.8.8.8", ok: true, data: { ip: "8.8.8.8", source: "mock" } }] })),
        ),
    );
    const forged = finishedMeasurement("m-forged");
    forged.target = "evil.example";

    const response = await createApp().fetch(
      new Request("https://globaltrace.test/api/trace/enrich", {
        method: "POST",
        body: JSON.stringify({ measurementId: "m-trusted", measurement: forged }),
      }),
      { ...env, NXTRACE_API_V4_TOKEN: "secret" },
    );
    const body = (await response.json()) as { measurementId: string; target: string };

    expect(response.status).toBe(200);
    expect(body.measurementId).toBe("m-trusted");
    expect(body.target).toBe("example.com");
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

function createExecutionContext(): { ctx: ExecutionContext; promises: Promise<unknown>[] } {
  const promises: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: vi.fn((promise: Promise<unknown>) => {
      promises.push(promise);
    }),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
  return { ctx, promises };
}

function expectSecurityHeaders(headers: Headers): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    expect(headers.get(key)).toBe(value);
  }
}

function inProgressMeasurement(id = "m123") {
  return {
    id,
    type: "mtr",
    status: "in-progress",
    target: "example.com",
    probesCount: 1,
    results: [],
  };
}

function finishedMeasurement(id = "m-cache") {
  return {
    id,
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
