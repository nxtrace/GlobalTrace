import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GlobalpingMeasurement } from "../../shared/globalping";
import type { GlobalpingProbe, TraceResultResponse } from "../../shared/types";
import {
  createTrace,
  enrichTrace,
  fetchCachedTrace,
  fetchGlobalpingMeasurement,
} from "../api";
import {
  TRACE_MAX_POLL_ATTEMPTS,
  useTraceLifecycle,
  userFacingErrorMessage,
  type WorkspaceMode,
} from "./useTraceLifecycle";

vi.mock("../api", () => ({
  createTrace: vi.fn(),
  enrichTrace: vi.fn(),
  fetchCachedTrace: vi.fn(),
  fetchGlobalpingMeasurement: vi.fn(),
}));

vi.mock("../nexttraceGeo", () => ({
  enrichTraceWithNexttraceToken: vi.fn(),
}));

describe("useTraceLifecycle", () => {
  it("localizes enrichment admission failures", () => {
    expect(userFacingErrorMessage({ code: "ENRICH_RATE_LIMITED" }, "fallback")).toBe("地理信息请求频繁，请稍后重试");
    expect(userFacingErrorMessage({ code: "ENRICH_UNAVAILABLE" }, "fallback")).toBe("地理信息暂不可用");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("formats Globalping parameter validation errors for users", () => {
    expect(
      userFacingErrorMessage(
        new Error("parameter validation failed: locations are invalid"),
        "fallback",
      ),
    ).toBe("Globalping 请求参数无效：parameter validation failed: locations are invalid 请检查目标、筛选条件或高级参数。");
    expect(userFacingErrorMessage("unknown", "fallback")).toBe("fallback");
  });

  it("aborts an in-flight shared trace load and resets loading state", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(fetchCachedTrace).mockImplementation((_measurementId, signal) => {
      capturedSignal = signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    });

    const setters = createSetters();
    const { result } = renderHook(() => useTraceLifecycle(defaultArgs(setters)));

    let loadPromise: Promise<void>;
    act(() => {
      loadPromise = result.current.loadTrace("m123", false, "", "", "shared");
    });

    expect(setters.setLoading).toHaveBeenCalledWith(true);
    expect(setters.setMeasurementLoading).toHaveBeenCalledWith({ source: "shared", measurementId: "m123" });
    expect(setters.setWorkspaceMode).toHaveBeenCalledWith("select");
    expect(capturedSignal?.aborted).toBe(false);

    window.history.replaceState(null, "", "/?measurement=m123");
    act(() => result.current.cancelMeasurementLoading());
    await loadPromise!;

    expect(capturedSignal?.aborted).toBe(true);
    expect(setters.setLoading).toHaveBeenLastCalledWith(false);
    expect(setters.setMeasurementLoading).toHaveBeenLastCalledWith(null);
    expect(setters.setWorkspaceMode).toHaveBeenLastCalledWith("select");
    expect(setters.setMessage).toHaveBeenLastCalledWith("");
    expect(window.location.search).not.toContain("measurement=");
  });

  it("stops polling after the maximum attempts when a measurement stays in progress", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchCachedTrace).mockResolvedValue(null);
    vi.mocked(fetchGlobalpingMeasurement).mockResolvedValue(measurement("in-progress"));

    const setters = createSetters();
    const { result } = renderHook(() => useTraceLifecycle(defaultArgs(setters)));

    const loadPromise = act(async () => {
      const pending = result.current.loadTrace("m123", true, "", "", "created");
      await vi.runAllTimersAsync();
      await pending;
    });
    await loadPromise;

    expect(fetchGlobalpingMeasurement).toHaveBeenCalledTimes(TRACE_MAX_POLL_ATTEMPTS + 1);
    expect(enrichTrace).not.toHaveBeenCalled();
    expect(setters.setMessage).toHaveBeenCalledWith("measurement 仍在运行，请稍后通过分享 URL 重新打开。");
    expect(setters.setLoading).toHaveBeenLastCalledWith(false);
    expect(setters.setMeasurementLoading).toHaveBeenLastCalledWith(null);
  });

  it("opens the result workspace even when worker enrichment fails", async () => {
    vi.mocked(fetchCachedTrace).mockResolvedValue(null);
    vi.mocked(fetchGlobalpingMeasurement).mockResolvedValue(measurement("finished"));
    vi.mocked(enrichTrace).mockRejectedValue(new Error("cross-site requests are not allowed"));

    const setters = createSetters();
    const { result } = renderHook(() => useTraceLifecycle(defaultArgs(setters)));

    await act(async () => {
      await result.current.loadTrace("m123", false, "", "", "created");
    });

    expect(setters.setWorkspaceMode).toHaveBeenCalledWith("result");
    expect(setters.setResult).toHaveBeenCalled();
    expect(setters.setMessage).toHaveBeenCalledWith("cross-site requests are not allowed");
    expect(setters.setLoading).toHaveBeenLastCalledWith(false);
  });

  it("reveals the raw result while enrichment runs and ignores a late rejection after abort", async () => {
    const pendingEnrichment = deferred<TraceResultResponse>();
    vi.mocked(fetchCachedTrace).mockResolvedValueOnce(null);
    vi.mocked(fetchGlobalpingMeasurement).mockResolvedValue(measurement("finished"));
    vi.mocked(enrichTrace).mockReturnValueOnce(pendingEnrichment.promise);

    const setters = createSetters();
    const { result } = renderHook(() => useTraceLifecycle(defaultArgs(setters)));

    let firstLoad: Promise<void>;
    act(() => {
      firstLoad = result.current.loadTrace("m123", false, "", "", "created");
    });

    await waitFor(() => {
      expect(setters.setWorkspaceMode).toHaveBeenCalledWith("result");
      expect(setters.setLoading).toHaveBeenLastCalledWith(false);
      expect(setters.setMeasurementLoading).toHaveBeenLastCalledWith(null);
    });
    expect(setters.setResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ measurementId: "m123", status: "finished" }),
    );
    await waitFor(() => expect(enrichTrace).toHaveBeenCalledTimes(1));

    vi.mocked(fetchCachedTrace).mockResolvedValueOnce(finishedTrace("m456"));
    await act(async () => {
      await result.current.loadTrace("m456", false, "", "", "created");
    });

    const firstEnrichmentSignal = vi.mocked(enrichTrace).mock.calls[0]?.[1];
    expect(firstEnrichmentSignal?.aborted).toBe(true);

    await act(async () => {
      pendingEnrichment.reject(new Error("late enrichment failure"));
      await firstLoad!;
    });
    expect(setters.setMessage).not.toHaveBeenCalledWith("late enrichment failure");
  });

  it("stores the created measurement id before loading the trace", async () => {
    vi.mocked(createTrace).mockResolvedValue({ measurementId: "created-1", probesCount: 1, location: null });
    vi.mocked(fetchCachedTrace).mockResolvedValue({
      measurementId: "created-1",
      type: "mtr",
      target: "example.com",
      status: "finished",
      probesCount: 0,
      results: [],
      enrichment: { status: "skipped", cached: 0, fetched: 0, errors: [] },
    });
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => undefined);

    const setters = createSetters();
    const { result } = renderHook(() => useTraceLifecycle(defaultArgs(setters)));

    await act(async () => {
      await result.current.createAndLoadTrace();
    });

    expect(result.current.createdMeasurementIdRef.current).toBe("created-1");
    expect(String(replaceState.mock.calls[0]?.[2])).toContain("measurement=created-1");
    expect(fetchCachedTrace).toHaveBeenCalledWith("created-1", expect.any(AbortSignal));
  });
});

function defaultArgs(setters: ReturnType<typeof createSetters>) {
  return {
    filters: {},
    globalpingToken: "",
    ipVersion: 4 as const,
    limit: 3,
    packets: 5,
    port: "",
    probes: [] as GlobalpingProbe[],
    protocol: "ICMP" as const,
    target: "example.com",
    ...setters,
  };
}

function createSetters() {
  return {
    setLoading: vi.fn(),
    setMeasurementLoading: vi.fn(),
    setMessage: vi.fn(),
    setResult: vi.fn(),
    setWorkspaceMode: vi.fn<(value: WorkspaceMode | ((current: WorkspaceMode) => WorkspaceMode)) => void>(),
  };
}

function measurement(status: GlobalpingMeasurement["status"]): GlobalpingMeasurement {
  return {
    id: "m123",
    type: "mtr",
    status,
    target: "example.com",
    probesCount: 0,
    results: [],
  };
}

function finishedTrace(measurementId: string): TraceResultResponse {
  return {
    measurementId,
    type: "mtr",
    target: "example.com",
    status: "finished",
    probesCount: 0,
    results: [],
    enrichment: { status: "skipped", cached: 0, fetched: 0, errors: [] },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}
