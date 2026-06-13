import { Hono, type Context } from "hono";
import {
  DEFAULT_MAP_STYLE_URL,
  MAX_TRACE_PROBES,
  type TraceResultResponse,
} from "../shared/types";
import type { GlobalpingMeasurement } from "../shared/globalping";
import type { WorkerEnv } from "./env";
import { GlobalpingClient } from "./globalping";
import { applySecurityHeaders, createJsonResponse, HttpError, jsonError, ValidationError } from "./http";
import { enrichTraceResponse } from "./nxtrace";
import { measurementToTraceResponse } from "./transform";

type HonoEnv = {
  Bindings: WorkerEnv;
};

const TRACE_RESPONSE_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const TRACE_RESPONSE_CACHE_VERSION = "v2";
const PROBES_CACHE_TTL_SECONDS = 180;
const BACKGROUND_IMAGE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const TRACE_ENRICH_BODY_LIMIT_BYTES = 256_000;
const MAX_GLOBALPING_HOPS_PER_RESULT = 64;
const MAX_GLOBALPING_RAW_OUTPUT_CHARS = 20_000;
const BING_BACKGROUND_ARCHIVE_URL = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN";
const BING_ORIGIN = "https://www.bing.com";

interface BingBackgroundImage {
  url: string;
  title: string;
  copyright: string;
  copyrightlink: string;
  startdate: string;
  hsh: string;
}

export function createApp() {
  const app = new Hono<HonoEnv>();

  app.use("/api/*", async (c, next) => {
    await next();
    applySecurityHeaders(c.res.headers);
  });

  app.use("/api/trace/enrich", async (c, next) => {
    if (isCrossSiteRequest(c.req.raw)) {
      return c.json(jsonError("cross-site requests are not allowed"), 403);
    }
    await next();
  });

  app.get("/api/config", (c) =>
    c.json(
      {
        mapStyleUrl: c.env.MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL,
      },
      200,
      { "Cache-Control": "public, max-age=300" },
    ),
  );

  app.get("/api/background", async () => {
    const background = await fetchBingBackground().catch(() => null);
    if (!background) {
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return createJsonResponse(
      {
        imageUrl: "/api/background/image",
        title: background.title,
        copyright: background.copyright,
        copyrightLink: background.copyrightlink,
        source: "bing",
      },
      { headers: { "Cache-Control": "public, max-age=1800" } },
    );
  });

  app.get("/api/background/image", async (c) => {
    const background = await fetchBingBackground().catch(() => null);
    if (!background) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

    const responseCache = typeof caches === "undefined" ? undefined : caches.default;
    const cacheKey = backgroundImageCacheKey(background);
    const cachedImage = await responseCache?.match(cacheKey);
    if (cachedImage?.ok) return new Response(cachedImage.body, cachedImage);

    const imageResponse = await fetch(new URL(background.url, BING_ORIGIN).toString(), {
      headers: { Accept: "image/avif,image/webp,image/jpeg,image/*,*/*;q=0.8" },
    });
    const contentType = imageResponse.headers.get("Content-Type") || "";
    if (!imageResponse.ok || !contentType.startsWith("image/")) {
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }

    const response = new Response(imageResponse.body, {
      status: 200,
      headers: {
        "Cache-Control": `public, max-age=${BACKGROUND_IMAGE_CACHE_TTL_SECONDS}`,
        "Content-Type": contentType,
      },
    });
    queueCacheWrite(c, responseCache?.put(cacheKey, response.clone()));
    return response;
  });

  app.on(["GET", "HEAD"], "/api/probes", async (c) => {
    if (c.req.method === "HEAD") {
      return new Response(null, { headers: probesCacheHeaders() });
    }

    const responseCache = typeof caches === "undefined" ? undefined : caches.default;
    const cacheKey = probesCacheKey(c.req.raw, c.env);
    const cachedProbes = await responseCache?.match(cacheKey);
    if (cachedProbes?.ok) {
      return new Response(cachedProbes.body, cachedProbes);
    }

    const probes = await client(c.env).listProbes();
    const response = createJsonResponse({ probes, fetchedAt: new Date().toISOString() }, { headers: probesCacheHeaders() });
    queueCacheWrite(c, responseCache?.put(cacheKey, response.clone()));
    return response;
  });

  app.post("/api/trace/enrich", async (c) => {
    const body = requireRecord(await readJsonWithLimit<unknown>(c.req.raw, TRACE_ENRICH_BODY_LIMIT_BYTES), "request body");
    const measurementId = validateMeasurementId(body.measurementId);

    const responseCache = typeof caches === "undefined" ? undefined : caches.default;
    const cachedTrace = await readCachedTraceResponse(responseCache, measurementId);
    if (cachedTrace) {
      return c.json(cachedTrace);
    }

    const measurement = validateGlobalpingMeasurement(await client(c.env).getMeasurement(measurementId), measurementId);
    const trace = measurementToTraceResponse(measurement);
    const enriched = await enrichTraceResponse(trace, {
      apiBase: c.env.NXTRACE_API_BASE,
      token: c.env.NXTRACE_API_V4_TOKEN,
      cache: responseCache,
      waitUntil: (promise) => queueWaitUntil(c, promise),
    });
    const response = c.json(enriched);
    if (isCacheableTraceResponse(enriched)) {
      response.headers.set("Cache-Control", `public, max-age=${TRACE_RESPONSE_CACHE_TTL_SECONDS}`);
      await responseCache?.put(traceResponseCacheKey(measurementId), response.clone());
    } else if (enriched.status === "finished") {
      response.headers.set("Cache-Control", "no-store");
    }
    return response;
  });

  app.get("/api/trace/:measurementId", async (c) => {
    const measurementId = c.req.param("measurementId").trim();
    if (!measurementId) {
      return c.json(jsonError("measurementId is required"), 400);
    }
    const responseCache = typeof caches === "undefined" ? undefined : caches.default;
    const cachedTrace = await readCachedTraceResponse(responseCache, measurementId);
    if (cachedTrace) {
      return c.json(cachedTrace);
    }
    return new Response(null, { status: 204 });
  });

  app.notFound((c) => c.json(jsonError("not found"), 404));
  app.onError((error, _c) => {
    const status = error instanceof HttpError ? error.status : 502;
    const details = error instanceof HttpError ? error.details : undefined;
    return createJsonResponse(jsonError(error.message, details), { status });
  });

  return app;
}

function client(env: WorkerEnv): GlobalpingClient {
  return new GlobalpingClient({ baseUrl: env.GLOBALPING_API_BASE });
}

export async function handleRequest(request: Request, env: WorkerEnv, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return createApp().fetch(request, env, ctx);
  }
  return env.ASSETS.fetch(request);
}

async function readCachedTraceResponse(
  cache: Cache | undefined,
  measurementId: string,
): Promise<TraceResultResponse | null> {
  const response = await cache?.match(traceResponseCacheKey(measurementId));
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as TraceResultResponse | null;
  return body?.measurementId === measurementId && body.status === "finished" ? body : null;
}

function traceResponseCacheKey(measurementId: string): Request {
  return new Request(`https://globaltrace.local/cache/trace/${TRACE_RESPONSE_CACHE_VERSION}/${encodeURIComponent(measurementId)}`);
}

function isCacheableTraceResponse(trace: TraceResultResponse): boolean {
  if (trace.status !== "finished") return false;
  if (trace.enrichment.status === "complete") return true;
  return trace.enrichment.status === "skipped" && trace.enrichment.errors.length === 0;
}

function probesCacheKey(request: Request, env: WorkerEnv): Request {
  const url = new URL(request.url);
  url.pathname = "/__cache/api/probes";
  url.search = new URLSearchParams({
    globalping: env.GLOBALPING_API_BASE || "default",
  }).toString();
  return new Request(url.toString(), { method: "GET" });
}

async function fetchBingBackground(): Promise<BingBackgroundImage | null> {
  const response = await fetch(BING_BACKGROUND_ARCHIVE_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { images?: unknown[] } | null;
  const image = body?.images?.[0];
  if (!isBingBackgroundImage(image)) return null;
  return image;
}

function isBingBackgroundImage(value: unknown): value is BingBackgroundImage {
  if (!value || typeof value !== "object") return false;
  const image = value as Record<string, unknown>;
  return (
    isValidBingImagePath(image.url) &&
    typeof image.title === "string" &&
    typeof image.copyright === "string" &&
    typeof image.copyrightlink === "string" &&
    typeof image.startdate === "string" &&
    typeof image.hsh === "string"
  );
}

function isValidBingImagePath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value.startsWith("/th?")) return false;
  try {
    const url = new URL(value, BING_ORIGIN);
    return url.origin === BING_ORIGIN && url.pathname === "/th" && url.searchParams.has("id");
  } catch {
    return false;
  }
}

function backgroundImageCacheKey(background: BingBackgroundImage): Request {
  return new Request(
    `https://globaltrace.local/cache/background/${encodeURIComponent(background.startdate)}/${encodeURIComponent(background.hsh)}`,
  );
}

function probesCacheHeaders(): Headers {
  return new Headers({
    "Cache-Control": `public, max-age=${PROBES_CACHE_TTL_SECONDS}`,
  });
}

async function readJsonWithLimit<T>(request: Request, limitBytes: number): Promise<T> {
  const contentLength = parseContentLength(request.headers.get("Content-Length"));
  if (contentLength !== null && contentLength > limitBytes) {
    throw new ValidationError("request body is too large");
  }

  const text = await readTextWithLimit(request, limitBytes);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ValidationError("invalid json body");
  }
}

async function readTextWithLimit(request: Request, limitBytes: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > limitBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ValidationError("request body is too large");
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}

function parseContentLength(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isCrossSiteRequest(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return true;
  return request.headers.get("Sec-Fetch-Site") === "cross-site";
}

function queueCacheWrite(c: Context<HonoEnv>, write: Promise<unknown> | undefined): void {
  if (!write) return;
  queueWaitUntil(c, write);
}

function queueWaitUntil(c: Context<HonoEnv>, write: Promise<unknown>): void {
  const guarded = write.catch(() => undefined);
  let ctx: ExecutionContext | undefined;
  try {
    ctx = c.executionCtx as ExecutionContext | undefined;
  } catch {
    ctx = undefined;
  }
  if (ctx) {
    ctx.waitUntil(guarded);
  } else {
    void guarded;
  }
}

function validateMeasurementId(value: unknown): string {
  const id = requireString(value, "measurementId");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new ValidationError("measurementId is invalid");
  }
  return id;
}

function validateGlobalpingMeasurement(value: unknown, expectedMeasurementId: string): GlobalpingMeasurement {
  const measurement = requireRecord(value, "measurement");
  const id = requireString(measurement.id, "measurement.id");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new ValidationError("measurement.id is invalid");
  }
  if (id !== expectedMeasurementId) {
    throw new ValidationError("measurement.id does not match measurementId");
  }

  const type = requireString(measurement.type, "measurement.type");
  if (type !== "mtr") {
    throw new ValidationError("measurement.type must be mtr");
  }

  const status = requireString(measurement.status, "measurement.status");
  if (status !== "in-progress" && status !== "finished" && status !== "failed" && status !== "error") {
    throw new ValidationError("measurement.status is invalid");
  }

  const target = requireString(measurement.target, "measurement.target");
  if (!target || target.length > 253) {
    throw new ValidationError("measurement.target is invalid");
  }

  const probesCount = requireInteger(measurement.probesCount, "measurement.probesCount");
  if (probesCount < 0 || probesCount > MAX_TRACE_PROBES) {
    throw new ValidationError(`measurement.probesCount must be within range 0-${MAX_TRACE_PROBES}`);
  }

  if (measurement.results !== undefined) {
    if (!Array.isArray(measurement.results) || measurement.results.length > MAX_TRACE_PROBES) {
      throw new ValidationError(`measurement.results must contain at most ${MAX_TRACE_PROBES} items`);
    }
    measurement.results.forEach(validateResultItem);
  }

  return measurement as unknown as GlobalpingMeasurement;
}

function validateResultItem(value: unknown): void {
  const item = requireRecord(value, "measurement.results[]");
  const probe = requireRecord(item.probe, "measurement.results[].probe");
  requireString(probe.continent, "probe.continent");
  requireString(probe.region, "probe.region");
  requireString(probe.country, "probe.country");
  if (probe.state !== null && probe.state !== undefined && typeof probe.state !== "string") {
    throw new ValidationError("probe.state is invalid");
  }
  requireString(probe.city, "probe.city");
  requireInteger(probe.asn, "probe.asn");
  requireFiniteNumber(probe.latitude, "probe.latitude");
  requireFiniteNumber(probe.longitude, "probe.longitude");
  requireString(probe.network, "probe.network");
  validateStringArray(probe.tags, "probe.tags", 32);
  validateStringArray(probe.resolvers, "probe.resolvers", 32);

  const result = requireRecord(item.result, "measurement.results[].result");
  requireString(result.status, "result.status");
  if (result.rawOutput !== undefined) {
    const rawOutput = requireString(result.rawOutput, "result.rawOutput");
    if (rawOutput.length > MAX_GLOBALPING_RAW_OUTPUT_CHARS) {
      throw new ValidationError(`result.rawOutput must contain at most ${MAX_GLOBALPING_RAW_OUTPUT_CHARS} characters`);
    }
  }
  if (result.hops !== undefined) {
    if (!Array.isArray(result.hops) || result.hops.length > MAX_GLOBALPING_HOPS_PER_RESULT) {
      throw new ValidationError(`result.hops must contain at most ${MAX_GLOBALPING_HOPS_PER_RESULT} items`);
    }
    result.hops.forEach(validateHop);
  }
}

function validateHop(value: unknown): void {
  const hop = requireRecord(value, "result.hops[]");
  if (hop.resolvedAddress !== null && hop.resolvedAddress !== undefined) {
    requireString(hop.resolvedAddress, "hop.resolvedAddress");
  }
  if (hop.resolvedHostname !== null && hop.resolvedHostname !== undefined) {
    requireString(hop.resolvedHostname, "hop.resolvedHostname");
  }
  if (hop.asn !== undefined) {
    if (!Array.isArray(hop.asn) || hop.asn.length > 8 || !hop.asn.every((asn) => Number.isInteger(asn))) {
      throw new ValidationError("hop.asn is invalid");
    }
  }
  if (hop.timings !== undefined) {
    if (!Array.isArray(hop.timings) || hop.timings.length > 32) {
      throw new ValidationError("hop.timings is invalid");
    }
    for (const timing of hop.timings) {
      requireFiniteNumber(requireRecord(timing, "hop.timings[]").rtt, "timing.rtt");
    }
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${field} is invalid`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${field} is invalid`);
  }
  return value;
}

function requireInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value)) {
    throw new ValidationError(`${field} is invalid`);
  }
  return value as number;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${field} is invalid`);
  }
  return value;
}

function validateStringArray(value: unknown, field: string, maxItems: number): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > maxItems || !value.every((item) => typeof item === "string")) {
    throw new ValidationError(`${field} is invalid`);
  }
}

export { createJsonResponse };
