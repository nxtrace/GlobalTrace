import { AlertCircle, Eye, Loader2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTrace,
  enrichTrace,
  fetchCachedTrace,
  fetchConfig,
  fetchGlobalpingMeasurement,
  fetchLimits,
  fetchProbes,
  type AppConfig,
} from "./api";
import { FilterPanel, type IpVersionSelection } from "./components/FilterPanel";
import { LiquidGlassSurface } from "./components/LiquidGlassSurface";
import { ProbeTable } from "./components/ProbeTable";
import { TurnstileBox } from "./components/TurnstileBox";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Surface } from "./components/ui/surface";
import type { MapProjection } from "./components/mapProjection";
import { deferUntilIdle } from "./lib/defer";
import { filterChips, filterProbes, magicFromSelectedProbes, probeFilterSuggestions, probeToMagic } from "../shared/filters";
import { measurementToTraceResponse } from "../shared/transform";
import {
  DEFAULT_MAP_STYLE_URL,
  DEFAULT_PROBE_LIMIT,
  type GlobalpingLimitResponse,
  type GlobalpingProbe,
  type TraceFilters,
  type TraceProtocol,
  type TraceResultResponse,
} from "../shared/types";
import { nextThemeMode, type ThemeMode } from "./theme";
import "./styles.css";

export const POLL_DELAY_MS = 650;
export const TRACE_MAX_POLL_ATTEMPTS = 120;
const GLOBALPING_TOKEN_STORAGE_KEY = "globaltrace.globalpingToken";
const THEME_STORAGE_KEY = "globaltrace.themeMode";
const RESULT_MAP_PROJECTION_STORAGE_KEY = "globaltrace.viewMode";

type WorkspaceMode = "select" | "result";
type AppRoute = "/" | "/about";
type TraceLoadSource = "created" | "shared";
type TurnstileGate = { kind: "create" } | { kind: "shared"; measurementId: string };

const AboutPage = lazy(() => import("./components/AboutPage").then((module) => ({ default: module.AboutPage })));
const ProbeMap = lazy(() => import("./components/ProbeMap").then((module) => ({ default: module.ProbeMap })));
const ResultsView = lazy(() => import("./components/ResultsView").then((module) => ({ default: module.ResultsView })));

export function App() {
  const [route, setRoute] = useState<AppRoute>(currentRoute);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readStoredThemeMode);
  const [resultMapProjection, setResultMapProjection] = useState<MapProjection>(readStoredResultMapProjection);
  const [globalpingToken, setGlobalpingToken] = useState(readStoredGlobalpingToken);
  const [globalpingTokenDraft, setGlobalpingTokenDraft] = useState(globalpingToken);
  const [config, setConfig] = useState<AppConfig>({
    turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY || "",
    mapStyleUrl: import.meta.env.VITE_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL,
  });
  const [target, setTarget] = useState("globalping.io");
  const [protocol, setProtocol] = useState<TraceProtocol>("ICMP");
  const [ipVersion, setIpVersion] = useState<IpVersionSelection>("");
  const [port, setPort] = useState("");
  const [packets, setPackets] = useState(3);
  const [limit, setLimit] = useState(DEFAULT_PROBE_LIMIT);
  const [filters, setFilters] = useState<TraceFilters>({ magic: "world" });
  const [turnstileGate, setTurnstileGate] = useState<TurnstileGate | null>(null);
  const [dismissedSharedTurnstileId, setDismissedSharedTurnstileId] = useState("");
  const [configReady, setConfigReady] = useState(false);
  const [probes, setProbes] = useState<GlobalpingProbe[]>([]);
  const [probesStatus, setProbesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [limits, setLimits] = useState<GlobalpingLimitResponse | null>(null);
  const [limitsStatus, setLimitsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [result, setResult] = useState<TraceResultResponse | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("select");
  const [loading, setLoading] = useState(false);
  const [sharedLoadingMeasurementId, setSharedLoadingMeasurementId] = useState("");
  const [probeMapReady, setProbeMapReady] = useState(false);
  const [message, setMessage] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const [mapSelectionActive, setMapSelectionActive] = useState(false);
  const pollAbortRef = useRef<AbortController | null>(null);
  const bootstrappedRef = useRef(false);
  const createdMeasurementIdRef = useRef("");
  const sharedTraceStartedRef = useRef("");
  const mapSelectionLimitBeforeRef = useRef<number | null>(null);
  const mapSelectionLimitManuallyChangedRef = useRef(false);

  const finalResult = result?.status === "in-progress" ? null : result;
  const resultPriority = workspaceMode === "result" || Boolean(sharedLoadingMeasurementId);
  const canSubmit = configReady && !turnstileGate;
  const sharedTurnstileDismissed = Boolean(
    sharedLoadingMeasurementId &&
      config.turnstileSiteKey &&
      dismissedSharedTurnstileId === sharedLoadingMeasurementId &&
      !turnstileGate,
  );
  const filteredProbes = useMemo(() => filterProbes(probes, filters), [filters, probes]);
  const filterSuggestions = useMemo(() => probeFilterSuggestions(probes, filters), [filters, probes]);
  const chips = useMemo(() => filterChips(filters), [filters]);
  const quotaLabel = useMemo(() => {
    if (limitsStatus === "loading") return "诊断额度读取中";
    if (limitsStatus === "error" || !limits) return "诊断额度暂不可用";
    return `可创建诊断 ${limits.measurements.create.remaining}/${limits.measurements.create.limit}（${globalpingToken ? "Globalping Token" : "当前 IP"}）`;
  }, [globalpingToken, limits, limitsStatus]);

  useEffect(() => {
    const onPopState = () => setRoute(currentRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    writeStoredThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    writeStoredResultMapProjection(resultMapProjection);
  }, [resultMapProjection]);

  useEffect(() => {
    if (route !== "/" || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void bootstrap();
  }, [route]);

  useEffect(() => {
    if (route !== "/" || probeMapReady) return;
    return deferUntilIdle(() => setProbeMapReady(true));
  }, [probeMapReady, route]);

  useEffect(() => {
    if (route !== "/") return;
    void loadLimits(globalpingToken);
  }, [globalpingToken, route]);

  const loadTrace = useCallback(async (
    measurementId: string,
    poll: boolean,
    nextGlobalpingToken: string,
    nextTurnstileToken: string,
    source: TraceLoadSource,
  ) => {
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    setLoading(true);
    if (source === "shared") {
      setSharedLoadingMeasurementId(measurementId);
      setWorkspaceMode("result");
      setResult(null);
      setMessage("");
    } else {
      setSharedLoadingMeasurementId("");
    }
    try {
      const cached = await fetchCachedTrace(measurementId, controller.signal);
      if (cached) {
        setResult(cached);
        setMessage("");
        if (cached.status !== "in-progress") {
          setWorkspaceMode("result");
        }
        return;
      }

      let measurement = await fetchGlobalpingMeasurement(measurementId, nextGlobalpingToken, controller.signal);
      let current = measurementToTraceResponse(measurement);
      setResult(current);
      let attempts = 0;
      while (poll && current.status === "in-progress" && attempts < TRACE_MAX_POLL_ATTEMPTS) {
        attempts += 1;
        await sleep(POLL_DELAY_MS, controller.signal);
        measurement = await fetchGlobalpingMeasurement(measurementId, nextGlobalpingToken, controller.signal);
        current = measurementToTraceResponse(measurement);
        setResult(current);
      }

      if (current.status === "in-progress") {
        setMessage("measurement 仍在运行，请稍后通过分享 URL 重新打开。");
        return;
      }

      const enriched = await enrichTrace(measurement, nextTurnstileToken);
      setResult(enriched);
      setMessage("");
      if (enriched.status !== "in-progress") {
        setWorkspaceMode("result");
      }
    } catch (error) {
      if (isAbortError(error)) return;
      setMessage(userFacingErrorMessage(error, "加载 measurement 失败"));
    } finally {
      if (pollAbortRef.current === controller) {
        pollAbortRef.current = null;
        if (source === "shared") {
          setSharedLoadingMeasurementId("");
        }
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (route !== "/" || !configReady) return;
    const id = new URL(window.location.href).searchParams.get("measurement");
    if (!id || id === createdMeasurementIdRef.current) return;
    if (sharedTraceStartedRef.current === id) return;
    if (hasReusableSharedResult(result, id)) return;
    if (config.turnstileSiteKey) {
      if (result?.measurementId !== id) {
        setSharedLoadingMeasurementId(id);
        setWorkspaceMode("result");
        setMessage("");
      }
      if (dismissedSharedTurnstileId === id) return;
      if (turnstileGate?.kind === "shared" && turnstileGate.measurementId === id) return;
      setTurnstileGate({ kind: "shared", measurementId: id });
      return;
    }
    sharedTraceStartedRef.current = id;
    void loadTrace(id, true, globalpingToken, "", "shared");
  }, [
    config.turnstileSiteKey,
    configReady,
    dismissedSharedTurnstileId,
    globalpingToken,
    loadTrace,
    result,
    route,
    turnstileGate,
  ]);

  useEffect(() => () => pollAbortRef.current?.abort(), []);

  const bootstrap = async () => {
    const nextConfig = await fetchConfig().catch(() => null);
    if (nextConfig) {
      setConfig((current) => ({
        turnstileSiteKey: nextConfig.turnstileSiteKey || current.turnstileSiteKey,
        mapStyleUrl: nextConfig.mapStyleUrl || current.mapStyleUrl,
      }));
    }
    setConfigReady(true);

    try {
      const nextProbes = await fetchProbes();
      setProbes(nextProbes.probes);
      setProbesStatus("ready");
    } catch (error) {
      setProbesStatus("error");
      setMessage(userFacingErrorMessage(error, "初始化失败"));
    }

  };

  const loadLimits = async (token: string) => {
    setLimitsStatus("loading");
    try {
      const nextLimits = await fetchLimits(token);
      setLimits(nextLimits);
      setLimitsStatus("ready");
    } catch {
      setLimits(null);
      setLimitsStatus("error");
    }
  };

  const createAndLoadTrace = useCallback(async (activeTurnstileToken: string) => {
    setLoading(true);
    setMessage("");
    setWorkspaceMode("select");
    try {
      const created = await createTrace(
        {
          target,
          protocol,
          ipVersion: ipVersion || undefined,
          port: port.trim() ? Number(port) : undefined,
          packets,
          limit,
          filters,
          turnstileToken: activeTurnstileToken,
        },
        globalpingToken,
      );
      createdMeasurementIdRef.current = created.measurementId;
      const url = new URL(window.location.href);
      url.searchParams.set("measurement", created.measurementId);
      window.history.replaceState(null, "", url);
      await loadTrace(created.measurementId, true, globalpingToken, activeTurnstileToken, "created");
    } catch (error) {
      setMessage(userFacingErrorMessage(error, "创建 trace 失败"));
    } finally {
      setLoading(false);
    }
  }, [filters, globalpingToken, ipVersion, limit, loadTrace, packets, port, protocol, target]);

  const submit = useCallback(() => {
    if (!configReady) return;
    if (config.turnstileSiteKey) {
      setMessage("");
      setTurnstileGate({ kind: "create" });
      return;
    }
    void createAndLoadTrace("");
  }, [config.turnstileSiteKey, configReady, createAndLoadTrace]);

  const handleTurnstileToken = useCallback((token: string) => {
    if (!token || !turnstileGate) return;
    const gate = turnstileGate;
    setTurnstileGate(null);
    setDismissedSharedTurnstileId("");
    setMessage("");
    if (gate.kind === "shared") {
      sharedTraceStartedRef.current = gate.measurementId;
      void loadTrace(gate.measurementId, true, globalpingToken, token, "shared");
      return;
    }
    void createAndLoadTrace(token);
  }, [createAndLoadTrace, globalpingToken, loadTrace, turnstileGate]);

  const cancelTurnstileGate = useCallback(() => {
    if (turnstileGate?.kind === "shared") {
      setDismissedSharedTurnstileId(turnstileGate.measurementId);
      setSharedLoadingMeasurementId(turnstileGate.measurementId);
      setWorkspaceMode("result");
    }
    setTurnstileGate(null);
  }, [turnstileGate]);

  const retrySharedTurnstile = useCallback((measurementId: string) => {
    setDismissedSharedTurnstileId("");
    setMessage("");
    setSharedLoadingMeasurementId(measurementId);
    setWorkspaceMode("result");
    setTurnstileGate({ kind: "shared", measurementId });
  }, []);

  const resetMapSelectionLimitTracking = useCallback(() => {
    mapSelectionLimitBeforeRef.current = null;
    mapSelectionLimitManuallyChangedRef.current = false;
  }, []);

  const pickProbe = useCallback((probe: GlobalpingProbe) => {
    if (!mapSelectionActive) resetMapSelectionLimitTracking();
    setFilters({ magic: probeToMagic(probe) });
    setMapSelectionActive(true);
    setSelectionNotice(`已选择 ${probe.location.city || probe.location.country} · AS${probe.location.asn}`);
  }, [mapSelectionActive, resetMapSelectionLimitTracking]);

  const boxSelect = useCallback((selected: GlobalpingProbe[]) => {
    if (!selected.length) {
      setSelectionNotice("框选范围内没有可用 probe");
      return;
    }
    const selection = magicFromSelectedProbes(selected, 10);
    const nextLimit = Math.max(1, selection.selectedCount);
    if (!mapSelectionActive || mapSelectionLimitManuallyChangedRef.current || mapSelectionLimitBeforeRef.current === null) {
      mapSelectionLimitBeforeRef.current = limit;
    }
    mapSelectionLimitManuallyChangedRef.current = false;
    setFilters({ magic: selection.magic });
    setLimit(nextLimit);
    setMapSelectionActive(true);
    setSelectionNotice(
      selection.capped
        ? `框选 ${selected.length} 个 probes，已按上限取前 10 个`
        : `框选 ${selection.selectedCount} 个 probes`,
    );
  }, [limit, mapSelectionActive]);

  const clearMapSelection = useCallback(() => {
    setFilters({ magic: "world" });
    setSelectionNotice("");
    if (!mapSelectionLimitManuallyChangedRef.current && mapSelectionLimitBeforeRef.current !== null) {
      setLimit(mapSelectionLimitBeforeRef.current);
    }
    setMapSelectionActive(false);
    resetMapSelectionLimitTracking();
  }, [resetMapSelectionLimitTracking]);

  const reset = () => {
    setFilters({ magic: "world" });
    setWorkspaceMode("select");
    setSharedLoadingMeasurementId("");
    setLimit(DEFAULT_PROBE_LIMIT);
    setPort("");
    setPackets(3);
    setProtocol("ICMP");
    setIpVersion("");
    setSelectionNotice("");
    setMapSelectionActive(false);
    resetMapSelectionLimitTracking();
  };

  const handleFiltersChange = useCallback((nextFilters: TraceFilters) => {
    setFilters(nextFilters);
    setSelectionNotice("");
    setMapSelectionActive(false);
    resetMapSelectionLimitTracking();
  }, [resetMapSelectionLimitTracking]);

  const handleLimitChange = useCallback((nextLimit: number) => {
    if (mapSelectionActive) {
      mapSelectionLimitManuallyChangedRef.current = true;
    }
    setLimit(nextLimit);
  }, [mapSelectionActive]);

  const showResult = useCallback(() => {
    if (finalResult) setWorkspaceMode("result");
  }, [finalResult]);

  const closeResult = useCallback(() => {
    setWorkspaceMode("select");
    setSharedLoadingMeasurementId("");
  }, []);

  const saveGlobalpingToken = useCallback(() => {
    const trimmed = globalpingTokenDraft.trim();
    setGlobalpingToken(trimmed);
    setGlobalpingTokenDraft(trimmed);
    writeStoredGlobalpingToken(trimmed);
  }, [globalpingTokenDraft]);

  const clearGlobalpingToken = useCallback(() => {
    setGlobalpingToken("");
    setGlobalpingTokenDraft("");
    writeStoredGlobalpingToken("");
  }, []);

  const cycleThemeMode = useCallback(() => {
    setThemeMode((current) => nextThemeMode(current));
  }, []);

  const navigateAbout = useCallback(() => {
    window.history.pushState(null, "", "/about");
    setRoute("/about");
  }, []);

  const navigateHome = useCallback(() => {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    window.history.pushState(null, "", "/");
    setWorkspaceMode("select");
    setSharedLoadingMeasurementId("");
    setTurnstileGate(null);
    setDismissedSharedTurnstileId("");
    sharedTraceStartedRef.current = "";
    setMessage("");
    setLoading(false);
    setRoute("/");
  }, []);

  if (route === "/about") {
    return (
      <Suspense fallback={<AboutPageFallback />}>
        <AboutPage onBack={navigateHome} />
      </Suspense>
    );
  }

  return (
    <main className={`app-shell${resultPriority ? " result-priority" : ""}`}>
        <FilterPanel
          target={target}
          protocol={protocol}
          ipVersion={ipVersion}
          port={port}
          packets={packets}
          limit={limit}
          filters={filters}
          filterSuggestions={filterSuggestions}
          chips={chips}
          visibleProbes={filteredProbes.length}
          totalProbes={probes.length}
          probesStatus={probesStatus}
          quotaLabel={quotaLabel}
          selectionNotice={selectionNotice}
          loading={loading}
          turnstileSiteKey={config.turnstileSiteKey}
          canSubmit={canSubmit}
          globalpingTokenDraft={globalpingTokenDraft}
          globalpingTokenSaved={Boolean(globalpingToken)}
          themeMode={themeMode}
          onTargetChange={setTarget}
          onProtocolChange={setProtocol}
          onIpVersionChange={setIpVersion}
          onPortChange={setPort}
          onPacketsChange={setPackets}
          onLimitChange={handleLimitChange}
          onFiltersChange={handleFiltersChange}
          onGlobalpingTokenDraftChange={setGlobalpingTokenDraft}
          onSaveGlobalpingToken={saveGlobalpingToken}
          onClearGlobalpingToken={clearGlobalpingToken}
          onCycleThemeMode={cycleThemeMode}
          onNavigateHome={navigateHome}
          onNavigateAbout={navigateAbout}
          onReset={reset}
          onSubmit={submit}
        />

        <div className="workspace">
          <LiquidGlassSurface variant="toolbar" fullWidth className="status-surface">
            <header className="status-bar">
              <div>
                <strong>网络路径诊断</strong>
                <span>从全球探针发起 MTR，展示跳点延迟、丢包与地理信息</span>
              </div>
              <div className="status-actions">
                {finalResult && workspaceMode === "select" && (
                  <Button variant="glass" size="sm" type="button" onClick={showResult} aria-label="查看结果">
                    <Eye size={16} />
                    查看结果
                  </Button>
                )}
                {limits && (
                  <Badge variant="accent" className="quota-chip">
                    {limits.measurements.create.remaining}/{limits.measurements.create.limit}
                  </Badge>
                )}
              </div>
            </header>
          </LiquidGlassSurface>

          {message && (
            <Surface variant="flat" className="error-banner" role="alert">
              <AlertCircle size={18} />
              {message}
            </Surface>
          )}

          {loading && !sharedLoadingMeasurementId && (
            <Surface variant="flat" className="loading-strip">
              <Loader2 size={18} className="spin" />
              正在读取 measurement，完成后会自动展示结果。
            </Surface>
          )}

          <div className="workspace-content">
            {sharedLoadingMeasurementId ? (
              <SharedResultLoading
                measurementId={sharedLoadingMeasurementId}
                requiresTurnstile={sharedTurnstileDismissed}
                onVerify={retrySharedTurnstile}
              />
            ) : workspaceMode === "select" || !finalResult ? (
              <div className="map-and-table">
                {probeMapReady ? (
                  <Suspense fallback={<ProbeMapFallback />}>
                    <ProbeMap
                      probes={filteredProbes}
                      totalProbes={probes.length}
                      status={probesStatus}
                      selectionNotice={selectionNotice}
                      selectionActive={mapSelectionActive}
                      mapStyleUrl={config.mapStyleUrl}
                      onPickProbe={pickProbe}
                      onBoxSelect={boxSelect}
                      onClearSelection={clearMapSelection}
                    />
                  </Suspense>
                ) : (
                  <ProbeMapFallback />
                )}
                <ProbeTable probes={filteredProbes} totalProbes={probes.length} status={probesStatus} onPick={pickProbe} />
              </div>
            ) : (
              <Suspense fallback={<ResultsViewFallback />}>
                <ResultsView
                  result={finalResult}
                  mapStyleUrl={config.mapStyleUrl}
                  mapProjection={resultMapProjection}
                  onMapProjectionChange={setResultMapProjection}
                  onClose={closeResult}
                />
              </Suspense>
            )}
          </div>
        </div>
        {turnstileGate && config.turnstileSiteKey && (
          <TurnstileDialog
            gate={turnstileGate}
            siteKey={config.turnstileSiteKey}
            onToken={handleTurnstileToken}
            onCancel={cancelTurnstileGate}
          />
        )}
    </main>
  );
}

function AboutPageFallback() {
  return (
    <main className="about-shell">
      <Surface asChild className="about-panel">
        <section role="status" aria-live="polite" aria-label="正在加载关于页面">
          <div className="empty-hero">
            <Loader2 size={20} className="spin" />
            <div>
              <h2>正在加载关于页面</h2>
            </div>
          </div>
        </section>
      </Surface>
    </main>
  );
}

function ProbeMapFallback() {
  return (
    <Surface asChild className="map-section" aria-label="正在加载 probe map">
      <section role="status" aria-live="polite">
        <div className="map-container map-loading-placeholder">
          <Loader2 size={22} className="spin" />
          <span>正在加载地图</span>
        </div>
      </section>
    </Surface>
  );
}

function ResultsViewFallback() {
  return (
    <Surface asChild className="result-empty">
      <section role="status" aria-live="polite" aria-label="正在加载结果视图">
        <div className="empty-hero">
          <Loader2 size={20} className="spin" />
          <div>
            <h2>正在加载结果视图</h2>
            <p>地图与 hop 明细加载完成后会自动显示。</p>
          </div>
        </div>
      </section>
    </Surface>
  );
}

function TurnstileDialog({
  gate,
  siteKey,
  onToken,
  onCancel,
}: {
  gate: TurnstileGate;
  siteKey: string;
  onToken: (token: string) => void;
  onCancel: () => void;
}) {
  const title = gate.kind === "shared" ? "验证后打开分享结果" : "验证后开始诊断";
  const description = gate.kind === "shared" ? "完成 Turnstile 后会自动读取 measurement 并展示结果。" : "完成 Turnstile 后会自动创建并运行诊断。";

  return (
    <div className="turnstile-overlay">
      <Surface asChild className="turnstile-dialog">
        <section role="dialog" aria-modal="true" aria-labelledby="turnstile-dialog-title">
          <div className="turnstile-dialog-copy">
            <h2 id="turnstile-dialog-title">{title}</h2>
            <p>{description}</p>
          </div>
          <TurnstileBox siteKey={siteKey} onToken={onToken} />
          <div className="turnstile-dialog-actions">
            <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
              取消
            </Button>
          </div>
        </section>
      </Surface>
    </div>
  );
}

function SharedResultLoading({
  measurementId,
  requiresTurnstile,
  onVerify,
}: {
  measurementId: string;
  requiresTurnstile?: boolean;
  onVerify?: (measurementId: string) => void;
}) {
  return (
    <Surface asChild className="shared-result-loading">
      <section role="status" aria-live="polite" aria-label="正在打开分享结果">
        {!requiresTurnstile && <Loader2 size={24} className="spin" />}
        <div>
          <h2>{requiresTurnstile ? "需要完成人机验证" : "正在打开分享结果"}</h2>
          <p>{requiresTurnstile ? "完成 Turnstile 后会自动打开分享结果。" : "正在读取 Globalping measurement，完成后会自动展示结果。"}</p>
          <span>{measurementId}</span>
          {requiresTurnstile && (
            <Button variant="glass" size="sm" type="button" onClick={() => onVerify?.(measurementId)}>
              继续验证
            </Button>
          )}
        </div>
      </section>
    </Surface>
  );
}

function currentRoute(): AppRoute {
  return window.location.pathname === "/about" ? "/about" : "/";
}

function hasReusableSharedResult(result: TraceResultResponse | null, measurementId: string): boolean {
  return result?.measurementId === measurementId && result.status !== "in-progress";
}

function readStoredGlobalpingToken(): string {
  try {
    return window.localStorage.getItem(GLOBALPING_TOKEN_STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function writeStoredGlobalpingToken(token: string): void {
  try {
    if (token) {
      window.localStorage.setItem(GLOBALPING_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(GLOBALPING_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures; the token still works for the current tab.
  }
}

function readStoredThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  } catch {
    return "system";
  }
}

function writeStoredThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Theme persistence is best-effort.
  }
}

function readStoredResultMapProjection(): MapProjection {
  try {
    return window.localStorage.getItem(RESULT_MAP_PROJECTION_STORAGE_KEY) === "3d" ? "globe" : "mercator";
  } catch {
    return "mercator";
  }
}

function writeStoredResultMapProjection(projection: MapProjection): void {
  try {
    window.localStorage.setItem(RESULT_MAP_PROJECTION_STORAGE_KEY, projection === "globe" ? "3d" : "2d");
  } catch {
    // Result map projection persistence is best-effort.
  }
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function userFacingErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (/parameter validation failed/i.test(message)) {
    return `Globalping 筛选条件无效：${message} 请重置筛选，或改用国家/地区、城市、ASN 等较短条件。`;
  }
  return message;
}
