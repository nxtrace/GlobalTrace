import { afterEach, describe, expect, it, vi } from "vitest";
import { deferUntilIdle } from "./defer";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("deferUntilIdle", () => {
  it("runs work through requestIdleCallback when available", async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((idleCallback: IdleRequestCallback) =>
        window.setTimeout(() => idleCallback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline), 0),
      ),
    );
    vi.stubGlobal("cancelIdleCallback", vi.fn((id: number) => window.clearTimeout(id)));

    deferUntilIdle(callback);
    expect(callback).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("can cancel scheduled idle work", async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((idleCallback: IdleRequestCallback) =>
        window.setTimeout(() => idleCallback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline), 0),
      ),
    );
    vi.stubGlobal("cancelIdleCallback", vi.fn((id: number) => window.clearTimeout(id)));

    const cancel = deferUntilIdle(callback);
    cancel();

    await vi.runAllTimersAsync();
    expect(callback).not.toHaveBeenCalled();
  });

  it("falls back to the frame after first paint when idle callback is unavailable", async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((frameCallback: FrameRequestCallback) => window.setTimeout(() => frameCallback(0), 0)),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => window.clearTimeout(id)));

    deferUntilIdle(callback);

    await vi.runAllTimersAsync();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
