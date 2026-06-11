export function deferUntilIdle(callback: () => void, timeoutMs = 1200): () => void {
  if (typeof window === "undefined") return () => undefined;

  if ("requestIdleCallback" in window && typeof window.requestIdleCallback === "function") {
    const idleId = window.requestIdleCallback(callback, { timeout: timeoutMs });
    return () => window.cancelIdleCallback?.(idleId);
  }

  if (typeof window.requestAnimationFrame === "function") {
    let timerId: number | undefined;
    const frameId = window.requestAnimationFrame(() => {
      timerId = window.setTimeout(callback, 0);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }

  const timerId = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timerId);
}
