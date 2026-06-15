import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { createTrace, enrichTrace, fetchCachedTrace, fetchGlobalpingMeasurement } from "../api";
import { enrichTraceWithNexttraceToken } from "../nexttraceGeo";
import { normalizeMagicFiltersForProbes } from "../../shared/filters";
import { measurementToTraceResponse } from "../../shared/transform";
import { MAX_TRACE_PROBES, type GlobalpingProbe, type TraceFilters, type TraceProtocol, type TraceResultResponse } from "../../shared/types";
import type { GlobalpingMeasurement } from "../../shared/globalping";
import type { IpVersionSelection } from "../components/FilterPanel";

export const POLL_DELAY_MS = 1000;
export const ENRICH_AFTER_FINISHED_DELAY_MS = 500;
export const TRACE_MAX_POLL_ATTEMPTS = 120;

export type WorkspaceMode = "select" | "result";
type TraceLoadSource = "created" | "shared";
type TraceEnrichmentMode = "worker" | "nexttraceToken";

export interface MeasurementLoadingState {
  source: TraceLoadSource;
  measurementId?: string;
}

interface UseTraceLifecycleArgs {
  filters: TraceFilters;
  globalpingToken: string;
  ipVersion: IpVersionSelection;
  limit: number;
  packets: number;
  port: string;
  probes: GlobalpingProbe[];
  protocol: TraceProtocol;
  target: string;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setMeasurementLoading: Dispatch<SetStateAction<MeasurementLoadingState | null>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setResult: Dispatch<SetStateAction<TraceResultResponse | null>>;
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>;
}

export function useTraceLifecycle({
  filters,
  globalpingToken,
  ipVersion,
  limit,
  packets,
  port,
  probes,
  protocol,
  target,
  setLoading,
  setMeasurementLoading,
  setMessage,
  setResult,
  setWorkspaceMode,
}: UseTraceLifecycleArgs) {
  const pollAbortRef = useRef<AbortController | null>(null);
  const createdMeasurementIdRef = useRef("");
  const sharedTraceStartedRef = useRef("");

  const loadTrace = useCallback(async (
    measurementId: string,
    poll: boolean,
    nextGlobalpingToken: string,
    nextEnrichmentToken: string,
    source: TraceLoadSource,
    enrichmentMode: TraceEnrichmentMode = "worker",
  ) => {
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    setLoading(true);
    setMeasurementLoading({ source, measurementId });
    if (source === "shared") {
      setWorkspaceMode("select");
      setResult(null);
      setMessage("");
    }
    try {
      if (enrichmentMode === "worker") {
        const cached = await fetchCachedTrace(measurementId, controller.signal);
        if (controller.signal.aborted) return;
        if (cached) {
          setResult(cached);
          setMessage("");
          if (cached.status !== "in-progress") {
            setWorkspaceMode("result");
          }
          return;
        }
      }

      let measurement = await fetchGlobalpingMeasurement(measurementId, nextGlobalpingToken, controller.signal);
      if (controller.signal.aborted) return;
      let current = mtrMeasurementToTraceResponse(measurement);
      setResult(current);
      let attempts = 0;
      while (poll && current.status === "in-progress" && attempts < TRACE_MAX_POLL_ATTEMPTS) {
        attempts += 1;
        await sleep(POLL_DELAY_MS, controller.signal);
        measurement = await fetchGlobalpingMeasurement(measurementId, nextGlobalpingToken, controller.signal);
        if (controller.signal.aborted) return;
        current = mtrMeasurementToTraceResponse(measurement);
        setResult(current);
      }

      if (current.status === "in-progress") {
        setMessage("measurement 仍在运行，请稍后通过分享 URL 重新打开。");
        return;
      }

      const enriched =
        enrichmentMode === "worker"
          ? await enrichTraceAfterGlobalpingCooldown(measurementId, controller.signal)
          : await enrichTraceWithNexttraceToken(current, nextEnrichmentToken, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setResult(enriched);
      setMessage("");
      if (enriched.status !== "in-progress") {
        setWorkspaceMode("result");
      }
    } catch (error) {
      if (isAbortError(error)) return;
      if (isNonMtrMeasurementError(error)) {
        setResult(null);
      }
      setMessage(userFacingErrorMessage(error, "加载 measurement 失败"));
    } finally {
      if (pollAbortRef.current === controller) {
        pollAbortRef.current = null;
        setMeasurementLoading(null);
        setLoading(false);
      }
    }
  }, [setLoading, setMeasurementLoading, setMessage, setResult, setWorkspaceMode]);

  const createAndLoadTrace = useCallback(async (
    enrichmentMode: TraceEnrichmentMode = "worker",
    activeNexttraceToken = "",
  ) => {
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    setLoading(true);
    setMeasurementLoading({ source: "created" });
    setMessage("");
    setWorkspaceMode("select");
    try {
      const traceFilters = normalizeMagicFiltersForProbes(filters, probes, MAX_TRACE_PROBES);
      const created = await createTrace(
        {
          target,
          protocol,
          ipVersion,
          port: port.trim() ? Number(port) : undefined,
          packets,
          limit,
          filters: traceFilters,
        },
        globalpingToken,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      createdMeasurementIdRef.current = created.measurementId;
      const url = new URL(window.location.href);
      url.searchParams.set("measurement", created.measurementId);
      window.history.replaceState(null, "", url);
      setMeasurementLoading({ source: "created", measurementId: created.measurementId });
      await loadTrace(
        created.measurementId,
        true,
        globalpingToken,
        enrichmentMode === "nexttraceToken" ? activeNexttraceToken : "",
        "created",
        enrichmentMode,
      );
    } catch (error) {
      if (isAbortError(error)) return;
      setMessage(userFacingErrorMessage(error, "创建 trace 失败"));
    } finally {
      if (pollAbortRef.current === controller) {
        pollAbortRef.current = null;
        setMeasurementLoading(null);
        setLoading(false);
      }
    }
  }, [filters, globalpingToken, ipVersion, limit, loadTrace, packets, port, probes, protocol, setLoading, setMeasurementLoading, setMessage, setWorkspaceMode, target]);

  const abortTraceLoading = useCallback(() => {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
  }, []);

  const cancelMeasurementLoading = useCallback(() => {
    abortTraceLoading();
    setLoading(false);
    setMeasurementLoading(null);
    setWorkspaceMode("select");
    setMessage("");
    sharedTraceStartedRef.current = "";
  }, [abortTraceLoading, setLoading, setMeasurementLoading, setMessage, setWorkspaceMode]);

  return {
    abortTraceLoading,
    cancelMeasurementLoading,
    createdMeasurementIdRef,
    createAndLoadTrace,
    loadTrace,
    sharedTraceStartedRef,
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function enrichTraceAfterGlobalpingCooldown(measurementId: string, signal: AbortSignal): Promise<TraceResultResponse> {
  await sleep(ENRICH_AFTER_FINISHED_DELAY_MS, signal);
  return enrichTrace(measurementId, signal);
}

function mtrMeasurementToTraceResponse(measurement: GlobalpingMeasurement): TraceResultResponse {
  if (measurement.type !== "mtr") {
    throw new Error("measurement.type must be mtr");
  }
  return measurementToTraceResponse(measurement);
}

function isNonMtrMeasurementError(error: unknown): boolean {
  return error instanceof Error && error.message === "measurement.type must be mtr";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function userFacingErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (/parameter validation failed/i.test(message)) {
    return `Globalping 筛选条件无效：${message} 请重置筛选，或改用国家/地区、城市、ASN 等较短条件。`;
  }
  return message;
}
