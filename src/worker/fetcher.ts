export const defaultFetch: typeof fetch = (input, init) => fetch(input, init);

export const UPSTREAM_FETCH_TIMEOUT_MS = 10_000;

export function withUpstreamTimeout(init: RequestInit): RequestInit {
  return { ...init, signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS) };
}
