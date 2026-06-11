import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  DEFAULT_MAP_STYLE_URL,
  MAX_TRACE_PROBES,
  type TraceEnrichRequest,
  type TraceResultResponse,
  type TurnstileVerifyRequest,
} from "../shared/types";
import type { GlobalpingMeasurement } from "../shared/globalping";
import type { WorkerEnv } from "./env";
import { GlobalpingClient } from "./globalping";
import { createJsonResponse, HttpError, jsonError, readJson, ValidationError } from "./http";
import { enrichTraceResponse } from "./nxtrace";
import { measurementToTraceResponse } from "./transform";
import { verifyTurnstileToken } from "./turnstile";

type HonoEnv = {
  Bindings: WorkerEnv;
};

const TRACE_RESPONSE_CACHE_TTL_SECONDS = 120;
const PROBES_CACHE_TTL_SECONDS = 180;
const TRACE_ENRICH_BODY_LIMIT_BYTES = 256_000;
const MAX_GLOBALPING_HOPS_PER_RESULT = 64;
const MAX_GLOBALPING_RAW_OUTPUT_CHARS = 20_000;

export function createApp() {
  const app = new Hono<HonoEnv>();

  app.use(
    "/api/*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/api/config", (c) =>
    c.json({
      turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || "",
      mapStyleUrl: c.env.MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL,
    }),
  );

  app.on(["GET", "HEAD"], "/api/probes", async (c) => {
    if (c.req.method === "HEAD") {
      return new Response(null, { headers: probesCacheHeaders() });
    }

    const responseCache = typeof caches === "undefined" ? undefined : caches.default;
    const cacheKey = probesCacheKey(c.req.raw, c.env);
    const cachedProbes = await responseCache?.match(cacheKey);
    if (cachedProbes?.ok) {
      return cachedProbes;
    }

    const probes = await client(c.env).listProbes();
    const response = c.json({ probes, fetchedAt: new Date().toISOString() });
    for (const [key, value] of probesCacheHeaders()) {
      response.headers.set(key, value);
    }
    await responseCache?.put(cacheKey, response.clone());
    return response;
  });

  app.post("/api/turnstile/verify", async (c) => {
    const body = await readJson<TurnstileVerifyRequest>(c.req.raw);
    const result = await verifyTurnstileToken(c.env, c.req.raw, body.token);
    return c.json(result, result.success ? 200 : 400);
  });

  app.post("/api/trace/enrich", async (c) => {
    const body = await readJsonWithLimit<TraceEnrichRequest>(c.req.raw, TRACE_ENRICH_BODY_LIMIT_BYTES);
    const measurement = validateUploadedMeasurement(body.measurement);
    const turnstile = await verifyTurnstileToken(c.env, c.req.raw, body.turnstileToken);
    if (!turnstile.success) {
      return c.json(jsonError("turnstile verification failed", turnstile.errorCodes), 403);
    }

    const responseCache = typeof caches === "undefined" ? undefined : caches.default;
    const cachedTrace = await readCachedTraceResponse(responseCache, measurement.id);
    if (cachedTrace) {
      return c.json(cachedTrace);
    }

    const trace = measurementToTraceResponse(measurement);
    const enriched = await enrichTraceResponse(trace, {
      apiBase: c.env.NXTRACE_API_BASE,
      token: c.env.NXTRACE_API_V4_TOKEN,
      cache: responseCache,
    });
    const response = c.json(enriched);
    if (enriched.status === "finished") {
      response.headers.set("Cache-Control", `public, max-age=${TRACE_RESPONSE_CACHE_TTL_SECONDS}`);
      await responseCache?.put(traceResponseCacheKey(measurement.id), response.clone());
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
  return new Request(`https://globaltrace.local/cache/trace/${encodeURIComponent(measurementId)}`);
}

function probesCacheKey(request: Request, env: WorkerEnv): Request {
  const url = new URL(request.url);
  url.pathname = "/__cache/api/probes";
  url.search = new URLSearchParams({
    globalping: env.GLOBALPING_API_BASE || "default",
  }).toString();
  return new Request(url.toString(), { method: "GET" });
}

function probesCacheHeaders(): Headers {
  return new Headers({
    "Cache-Control": `public, max-age=${PROBES_CACHE_TTL_SECONDS}`,
  });
}

async function readJsonWithLimit<T>(request: Request, limitBytes: number): Promise<T> {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > limitBytes) {
    throw new ValidationError("request body is too large");
  }

  const text = await request.text();
  if (text.length > limitBytes) {
    throw new ValidationError("request body is too large");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ValidationError("invalid json body");
  }
}

function validateUploadedMeasurement(value: unknown): GlobalpingMeasurement {
  const measurement = requireRecord(value, "measurement");
  const id = requireString(measurement.id, "measurement.id");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new ValidationError("measurement.id is invalid");
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
