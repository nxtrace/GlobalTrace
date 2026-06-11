import type {
  GlobalpingLimitResponse,
  ProbeListResponse,
  TraceCreateRequest,
  TraceCreateResponse,
  TraceEnrichRequest,
  TraceResultResponse,
  TurnstileVerifyRequest,
  TurnstileVerifyResponse,
} from "../shared/types";
import {
  type GlobalpingMeasurement,
  toGlobalpingMeasurementRequest,
  validateTraceCreate,
} from "../shared/globalping";

const GLOBALPING_API_BASE = "https://api.globalping.io";

export interface AppConfig {
  turnstileSiteKey: string;
  mapStyleUrl: string;
}

export async function fetchConfig(): Promise<AppConfig> {
  return apiJson<AppConfig>("/api/config");
}

export async function fetchProbes(): Promise<ProbeListResponse> {
  return apiJson<ProbeListResponse>("/api/probes");
}

export async function fetchLimits(globalpingToken = ""): Promise<GlobalpingLimitResponse> {
  const body = await apiJson<{
    rateLimit?: { measurements?: { create?: GlobalpingLimitResponse["measurements"]["create"] } };
    credits?: GlobalpingLimitResponse["credits"];
  }>(`${GLOBALPING_API_BASE}/v1/limits`, {
    headers: globalpingAuthHeader(globalpingToken),
  });
  if (!body.rateLimit?.measurements?.create) {
    throw new Error("Globalping limits response is invalid");
  }
  return {
    measurements: { create: body.rateLimit.measurements.create },
    credits: body.credits,
  };
}

export async function createTrace(request: TraceCreateRequest, globalpingToken = ""): Promise<TraceCreateResponse> {
  const input = validateTraceCreate(request);
  const response = await fetch(`${GLOBALPING_API_BASE}/v1/measurements`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...globalpingAuthHeader(globalpingToken),
    },
    body: JSON.stringify(toGlobalpingMeasurementRequest(input)),
  });
  const body = (await response.json().catch(() => null)) as { id?: string; probesCount?: number } | null;
  if (!response.ok || !body?.id) {
    throw new Error(errorMessageFromBody(body) || `HTTP ${response.status}`);
  }
  return {
    measurementId: body.id,
    probesCount: Number(body.probesCount || input.limit),
    location: response.headers.get("Location"),
  };
}

export async function fetchGlobalpingMeasurement(
  measurementId: string,
  globalpingToken = "",
  signal?: AbortSignal,
): Promise<GlobalpingMeasurement> {
  return apiJson<GlobalpingMeasurement>(`${GLOBALPING_API_BASE}/v1/measurements/${encodeURIComponent(measurementId)}`, {
    headers: globalpingAuthHeader(globalpingToken),
    signal,
  });
}

export async function fetchCachedTrace(measurementId: string, signal?: AbortSignal): Promise<TraceResultResponse | null> {
  const response = await fetch(`/api/trace/${encodeURIComponent(measurementId)}`, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    signal,
  });
  if (response.status === 204 || response.status === 404) {
    return null;
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(errorMessageFromBody(body) || `HTTP ${response.status}`);
  }
  return body as TraceResultResponse;
}

export async function enrichTrace(measurement: GlobalpingMeasurement, turnstileToken = ""): Promise<TraceResultResponse> {
  const request: TraceEnrichRequest = { measurement, turnstileToken };
  return apiJson<TraceResultResponse>("/api/trace/enrich", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function verifyTurnstile(token: string): Promise<TurnstileVerifyResponse> {
  const request: TurnstileVerifyRequest = { token };
  return apiJson<TurnstileVerifyResponse>("/api/turnstile/verify", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(errorMessageFromBody(body) || `HTTP ${response.status}`);
  }
  return body as T;
}

function globalpingAuthHeader(token: string): HeadersInit {
  const trimmed = token.trim();
  return trimmed ? { Authorization: `Bearer ${trimmed}` } : {};
}

function errorMessageFromBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const maybe = body as { error?: { message?: string }; message?: string };
  return maybe.error?.message || maybe.message || "";
}
