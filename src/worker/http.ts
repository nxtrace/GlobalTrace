import type { ApiErrorResponse } from "../shared/types";

export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
    this.name = "ValidationError";
  }
}

export class UpstreamError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(502, message, details);
    this.name = "UpstreamError";
  }
}

export function jsonError(message: string, details?: unknown): ApiErrorResponse {
  return details === undefined ? { error: { message } } : { error: { message, details } };
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ValidationError("invalid json body");
  }
}

export function getClientIp(request: Request): string | undefined {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    undefined
  );
}

export function createJsonResponse(value: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { ...init, headers });
}
