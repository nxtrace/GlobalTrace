import { afterEach, describe, expect, it, vi } from "vitest";
import { checkNxtraceStatus, NxtraceBatchError, runNxtraceBatches } from "./nxtraceBatch";

const ips = (count: number) => Array.from({ length: count }, (_, i) => `8.8.${Math.floor(i / 256)}.${i % 256}`);
const success = (batch: string[]) => batch.map((ip) => ({ ip, ok: true, data: { ip } }));
const gatewayFailure = () => new NxtraceBatchError("HTTP 504", true);

afterEach(() => vi.useRealTimers());

describe("NextTrace task budget", () => {
  it.each([0, 1, 2])("stops immediately on 429 at root/half position %s", async (position) => {
    const request = vi.fn(async (batch: string[]) => {
      const call = request.mock.calls.length - 1;
      if (call === position) throw new NxtraceBatchError("HTTP 429", false, "upstream_throttled", "120");
      if (call === 0) throw gatewayFailure();
      return success(batch);
    });
    const result = await runNxtraceBatches(ips(32), request);
    expect(request).toHaveBeenCalledTimes(position + 1);
    expect(result.retryAfter).toBe("120");
    expect(result.results).toHaveLength(position === 2 ? 8 : 0);
    expect(result.errors.flatMap((error) => error.ips)).toHaveLength(position === 2 ? 24 : 32);
  });

  it("bounds sustained 5xx across multiple chunks to three requests", async () => {
    const request = vi.fn(async () => { throw gatewayFailure(); });
    const result = await runNxtraceBatches(ips(64), request);
    expect(request).toHaveBeenCalledTimes(3);
    expect(result.errors.flatMap((error) => error.ips)).toEqual(ips(64));
  });

  it("does not replenish the split budget for another original batch", async () => {
    const request = vi.fn(async (batch: string[]) => {
      if (batch.length === 16) throw gatewayFailure();
      return success(batch);
    });
    const result = await runNxtraceBatches(ips(48), request);
    expect(request).toHaveBeenCalledTimes(4);
    expect(result.results.map((item) => item.ip)).toEqual(ips(16));
    expect(result.errors.flatMap((error) => error.ips)).toEqual(ips(48).slice(16));
  });

  it("caps healthy oversized jobs at 42 attempts", async () => {
    const request = vi.fn(async (batch: string[]) => success(batch));
    const result = await runNxtraceBatches(ips(700), request);
    expect(request).toHaveBeenCalledTimes(42);
    expect(result.reason).toBe("request_budget");
    expect(result.results).toHaveLength(672);
    expect(result.errors.flatMap((error) => error.ips)).toHaveLength(28);
  });

  it.each(["invalid_response", "unavailable", "limited"])("stops on %s without splitting", async (reason) => {
    const request = vi.fn(async () => { throw new NxtraceBatchError("unavailable", false, reason); });
    const result = await runNxtraceBatches(ips(32), request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.reason).toBe(reason);
  });

  it("checks admission for each attempt including both split halves", async () => {
    const beforeRequest = vi.fn(async () => {
      if (beforeRequest.mock.calls.length === 3) throw new NxtraceBatchError("limited", false, "limited");
    });
    const request = vi.fn(async (batch: string[]) => {
      if (batch.length === 16) throw gatewayFailure();
      return success(batch);
    });
    const result = await runNxtraceBatches(ips(32), request, { beforeRequest });
    expect(beforeRequest).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.results).toHaveLength(8);
    expect(result.reason).toBe("limited");
  });

  it("times out a response body even when the reader swallows aborts", async () => {
    vi.useFakeTimers();
    const request = vi.fn<(batch: string[], signal: AbortSignal) => Promise<never>>(async () => new Promise<never>(() => undefined));
    const pending = runNxtraceBatches(ips(1), request);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    expect(result.durationMs).toBe(10_000);
    expect(result.reason).toBe("timeout");
    expect(request.mock.calls[0][1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("enforces one 30-second deadline across otherwise successful batches", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (batch: string[]) => {
      await new Promise((resolve) => setTimeout(resolve, 8_000));
      return success(batch);
    });
    const pending = runNxtraceBatches(ips(80), request);
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;
    expect(result.durationMs).toBe(30_000);
    expect(result.reason).toBe("deadline");
    expect(result.attempts).toBe(4);
    expect(result.results).toHaveLength(48);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("cancels during admission and cannot send a late request", async () => {
    const controller = new AbortController();
    let release!: () => void;
    const beforeRequest = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const request = vi.fn(async (batch: string[]) => success(batch));
    const pending = runNxtraceBatches(ips(32), request, { signal: controller.signal, beforeRequest });
    await Promise.resolve();
    controller.abort();
    const result = await pending;
    release();
    await Promise.resolve();
    expect(result.reason).toBe("cancelled");
    expect(request).not.toHaveBeenCalled();
  });

  it("does no admission or network work for fully cached input", async () => {
    const request = vi.fn();
    const beforeRequest = vi.fn();
    const result = await runNxtraceBatches([], request, { beforeRequest });
    expect(result.attempts).toBe(0);
    expect(beforeRequest).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("NextTrace HTTP failures", () => {
  it("does not wait for error-body cancellation before classifying 429", async () => {
    const body = new ReadableStream({ cancel: () => new Promise<void>(() => undefined) });
    await expect(checkNxtraceStatus(new Response(body, { status: 429 }), "nxtrace"))
      .rejects.toMatchObject({ retryable: false, reason: "upstream_throttled" });
  });

  it.each(["60", "0", "Wed, 21 Oct 2037 07:28:00 GMT"])("preserves valid Retry-After %s", async (value) => {
    await expect(checkNxtraceStatus(new Response("HTML", { status: 429, headers: { "Retry-After": value } }), "nxtrace"))
      .rejects.toMatchObject({ retryable: false, retryAfter: value });
  });

  it.each(["Invalid Date", "-1", "1.5", "Infinity", "999999999999999999999"])("rejects invalid Retry-After %s", async (value) => {
    await expect(checkNxtraceStatus(new Response("", { status: 429, headers: { "Retry-After": value } }), "nxtrace"))
      .rejects.toMatchObject({ retryAfter: undefined });
  });
});
