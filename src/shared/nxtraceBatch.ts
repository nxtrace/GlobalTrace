import { NXTRACE_BATCH_SIZE, type EnrichmentSummary, type NxtraceGeo } from "./types";

export interface NxtraceBatchResult {
  ip: string;
  ok: boolean;
  data?: NxtraceGeo;
  error?: string;
}

export class NxtraceBatchError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly reason = "upstream_error",
    readonly retryAfter?: string,
  ) {
    super(message);
    this.name = "NxtraceBatchError";
  }
}

export async function checkNxtraceStatus(response: Response, provider: string): Promise<void> {
  if (response.ok) return;
  const retryAfter = response.headers.get("Retry-After")?.trim();
  const validRetryAfter = retryAfter && (
    (/^\d+$/.test(retryAfter) && Number.isSafeInteger(Number(retryAfter))) ||
    (Number.isFinite(Date.parse(retryAfter)) && new Date(retryAfter).toUTCString() === retryAfter)
  );
  // Cancel unread error bodies without allowing a slow cancellation to turn 429 into a retryable timeout.
  void response.body?.cancel().catch(() => undefined);
  throw new NxtraceBatchError(
    `${provider} batch failed with HTTP ${response.status}`,
    response.status >= 500 && response.status <= 599,
    response.status === 429 ? "upstream_throttled" : "upstream_error",
    validRetryAfter ? retryAfter : undefined,
  );
}

interface BatchOptions {
  signal?: AbortSignal;
  beforeRequest?: () => Promise<void>;
}

// Request-local state: never share pending fetches or admission counters between requests.
export async function runNxtraceBatches(
  ips: string[],
  request: (ips: string[], signal: AbortSignal) => Promise<NxtraceBatchResult[]>,
  options: BatchOptions = {},
) {
  const results: NxtraceBatchResult[] = [];
  const errors: EnrichmentSummary["errors"] = [];
  const startedAt = Date.now();
  const deadline = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
  const timer = setTimeout(() => deadline.abort(new NxtraceBatchError("地理信息补全超时", false, "deadline")), 30_000);
  const maxAttempts = Math.min(Math.ceil(ips.length / NXTRACE_BATCH_SIZE) + 2, 42);
  let attempts = 0;
  let splitUsed = false;
  let stopped: NxtraceBatchError | undefined;

  function failure(error: unknown): NxtraceBatchError {
    if (deadline.signal.aborted) return deadline.signal.reason as NxtraceBatchError;
    if (options.signal?.aborted) return new NxtraceBatchError("地理信息补全已取消", false, "cancelled");
    if (error instanceof NxtraceBatchError) return error;
    const name = error && typeof error === "object" && "name" in error ? error.name : undefined;
    const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message : "地理信息暂不可用";
    return new NxtraceBatchError(message, name === "TimeoutError", name === "TimeoutError" ? "timeout" : "upstream_error");
  }

  async function attempt(batch: string[]): Promise<void> {
    signal.throwIfAborted();
    if (attempts >= maxAttempts) throw new NxtraceBatchError("地理信息补全已达上限", false, "request_budget");
    if (options.beforeRequest) await abortable(options.beforeRequest, signal);
    signal.throwIfAborted();
    const timeout = new AbortController();
    const attemptSignal = AbortSignal.any([signal, timeout.signal]);
    const attemptTimer = setTimeout(() => timeout.abort(new DOMException("地理信息补全超时", "TimeoutError")), 10_000);
    try {
      attempts += 1;
      results.push(...await abortable(() => request(batch, attemptSignal), attemptSignal));
    } finally {
      clearTimeout(attemptTimer);
    }
  }

  try {
    for (let offset = 0; offset < ips.length; offset += NXTRACE_BATCH_SIZE) {
      const batch = ips.slice(offset, offset + NXTRACE_BATCH_SIZE);
      try {
        await attempt(batch);
      } catch (error) {
        const initialFailure = failure(error);
        if (initialFailure.retryable && batch.length > 1 && !splitUsed) {
          splitUsed = true;
          const midpoint = Math.ceil(batch.length / 2);
          const halves = [batch.slice(0, midpoint), batch.slice(midpoint)];
          for (let half = 0; half < halves.length; half += 1) {
            try {
              await attempt(halves[half]);
            } catch (error) {
              const splitFailure = failure(error);
              stopped = splitFailure;
              errors.push({ ips: halves[half], message: splitFailure.message });
              // A retryable half failure may still leave useful data in its sibling.
              if (!splitFailure.retryable) {
                const remaining = halves.slice(half + 1).flat();
                if (remaining.length) errors.push({ ips: remaining, message: splitFailure.message });
                break;
              }
            }
          }
        } else {
          stopped = initialFailure;
          errors.push({ ips: batch, message: initialFailure.message });
        }
        if (stopped) {
          const remaining = ips.slice(offset + batch.length);
          if (remaining.length) errors.push({ ips: remaining, message: stopped.message });
          break;
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return { results, errors, attempts, durationMs: Date.now() - startedAt, reason: stopped?.reason, retryAfter: stopped?.retryAfter };
}

// Bound response-body reads and binding calls too, even if they swallow abort errors.
function abortable<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      return work();
    }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
