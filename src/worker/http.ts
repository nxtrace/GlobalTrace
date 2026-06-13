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

export const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tiles.openfreemap.org; font-src 'self' data: https://tiles.openfreemap.org; connect-src 'self' https://api.globalping.io https://api.nxtrace.org https://tiles.openfreemap.org; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

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

export async function readJsonResponseWithLimit<T>(response: Response, limitBytes: number): Promise<T | null> {
  try {
    const text = await readStreamTextWithLimit(response.body, limitBytes);
    return JSON.parse(text) as T;
  } catch {
    return null;
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
  applySecurityHeaders(headers);
  return new Response(JSON.stringify(value), { ...init, headers });
}

export function applySecurityHeaders(headers: Headers): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
}

async function readStreamTextWithLimit(body: ReadableStream<Uint8Array> | null, limitBytes: number): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > limitBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("response body is too large");
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
