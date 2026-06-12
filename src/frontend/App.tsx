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
import { Input } from "./components/ui/input";
import { Surface } from "./components/ui/surface";
import type { MapProjection } from "./components/mapProjection";
import { deferUntilIdle } from "./lib/defer";
import { enrichTraceWithBrowserFallback } from "./fallbackGeo";
import { enrichTraceWithNexttraceToken } from "./nexttraceGeo";
import {
  filterChips,
  filterProbes,
  magicFromSelectedProbes,
  normalizeMagicFiltersForProbes,
  probeFilterSuggestions,
  probeToMagic,
} from "../shared/filters";
import { measurementToTraceResponse } from "../shared/transform";
import {
  DEFAULT_MAP_STYLE_URL,
  DEFAULT_PROBE_LIMIT,
  MAX_TRACE_PROBES,
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
const NEXTTRACE_TOKEN_STORAGE_KEY = "globaltrace.nexttraceApiToken";
const NEXTTRACE_API_TOKEN_URL = "https://api.nxtrace.org/v4/api-tokens";
const THEME_STORAGE_KEY = "globaltrace.themeMode";
const RESULT_MAP_PROJECTION_STORAGE_KEY = "globaltrace.viewMode";

type WorkspaceMode = "select" | "result";
type AppRoute = "/" | "/about";
type TraceLoadSource = "created" | "shared";
type TraceEnrichmentMode = "verified" | "browserFallback" | "nexttraceToken";
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
  const [nexttraceToken, setNexttraceToken] = useState(readStoredNexttraceToken);
  const [nexttraceTokenDraft, setNexttraceTokenDraft] = useState(nexttraceToken);
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
  const filteredProbes = useMemo(() => filterProbes(probes, filters), [filters, probes]);
  const filterSuggestionFilters = useMemo<TraceFilters>(() => ({
    country: filters.country,
    city: filters.city,
    asn: filters.asn,
    network: filters.network,
    tag: filters.tag,
    eyeball: filters.eyeball,
    datacenter: filters.datacenter,
  }), [
    filters.asn,
    filters.city,
    filters.country,
    filters.datacenter,
    filters.eyeball,
    filters.network,
    filters.tag,
  ]);
  const filterSuggestions = useMemo(
    () => probeFilterSuggestions(probes, filterSuggestionFilters),
    [filterSuggestionFilters, probes],
  );
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
    nextEnrichmentToken: string,
    source: TraceLoadSource,
    enrichmentMode: TraceEnrichmentMode = "verified",
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
      if (enrichmentMode === "verified") {
        const cached = await fetchCachedTrace(measurementId, controller.signal);
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

      const enriched =
        enrichmentMode === "verified"
          ? await enrichTrace(measurement, nextEnrichmentToken)
          : enrichmentMode === "nexttraceToken"
            ? await enrichTraceWithNexttraceToken(current, nextEnrichmentToken, { signal: controller.signal })
            : await enrichTraceWithBrowserFallback(current, { signal: controller.signal });
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
    if (nexttraceToken) {
      sharedTraceStartedRef.current = id;
      void loadTrace(id, true, globalpingToken, nexttraceToken, "shared", "nexttraceToken");
      return;
    }
    if (config.turnstileSiteKey) {
      if (result?.measurementId !== id) {
        setSharedLoadingMeasurementId(id);
        setWorkspaceMode("result");
        setMessage("");
      }
      if (turnstileGate?.kind === "shared" && turnstileGate.measurementId === id) return;
      setTurnstileGate({ kind: "shared", measurementId: id });
      return;
    }
    sharedTraceStartedRef.current = id;
    void loadTrace(id, true, globalpingToken, "", "shared");
  }, [
    config.turnstileSiteKey,
    configReady,
    globalpingToken,
    loadTrace,
    nexttraceToken,
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

  const createAndLoadTrace = useCallback(async (
    activeTurnstileToken: string,
    enrichmentMode: TraceEnrichmentMode = "verified",
    activeNexttraceToken = "",
  ) => {
    setLoading(true);
    setMessage("");
    setWorkspaceMode("select");
    try {
      const traceFilters = normalizeMagicFiltersForProbes(filters, probes, MAX_TRACE_PROBES);
      const created = await createTrace(
        {
          target,
          protocol,
          ipVersion: ipVersion || undefined,
          port: port.trim() ? Number(port) : undefined,
          packets,
          limit,
          filters: traceFilters,
          turnstileToken: activeTurnstileToken,
        },
        globalpingToken,
      );
      createdMeasurementIdRef.current = created.measurementId;
      const url = new URL(window.location.href);
      url.searchParams.set("measurement", created.measurementId);
      window.history.replaceState(null, "", url);
      await loadTrace(
        created.measurementId,
        true,
        globalpingToken,
        enrichmentMode === "nexttraceToken" ? activeNexttraceToken : activeTurnstileToken,
        "created",
        enrichmentMode,
      );
    } catch (error) {
      setMessage(userFacingErrorMessage(error, "创建 trace 失败"));
    } finally {
      setLoading(false);
    }
  }, [filters, globalpingToken, ipVersion, limit, loadTrace, packets, port, probes, protocol, target]);

  const submit = useCallback(() => {
    if (!configReady) return;
    if (nexttraceToken) {
      void createAndLoadTrace("", "nexttraceToken", nexttraceToken);
      return;
    }
    if (config.turnstileSiteKey) {
      setMessage("");
      setTurnstileGate({ kind: "create" });
      return;
    }
    void createAndLoadTrace("");
  }, [config.turnstileSiteKey, configReady, createAndLoadTrace, nexttraceToken]);

  const handleTurnstileToken = useCallback((token: string) => {
    if (!token || !turnstileGate) return;
    const gate = turnstileGate;
    setTurnstileGate(null);
    setMessage("");
    if (gate.kind === "shared") {
      sharedTraceStartedRef.current = gate.measurementId;
      void loadTrace(gate.measurementId, true, globalpingToken, token, "shared");
      return;
    }
    void createAndLoadTrace(token);
  }, [createAndLoadTrace, globalpingToken, loadTrace, turnstileGate]);

  const cancelTurnstileGate = useCallback(() => {
    if (!turnstileGate) return;
    const gate = turnstileGate;
    setTurnstileGate(null);
    setMessage("");
    if (gate.kind === "shared") {
      sharedTraceStartedRef.current = gate.measurementId;
      void loadTrace(gate.measurementId, true, globalpingToken, "", "shared", "browserFallback");
      return;
    }
    void createAndLoadTrace("", "browserFallback");
  }, [createAndLoadTrace, globalpingToken, loadTrace, turnstileGate]);

  const resetMapSelectionLimitTracking = useCallback(() => {
    mapSelectionLimitBeforeRef.current = null;
    mapSelectionLimitManuallyChangedRef.current = false;
  }, []);

  const expandLimitForExplicitFilters = useCallback((nextFilters: TraceFilters) => {
    if (!hasExplicitFilter(nextFilters)) return;
    const nextLimit = Math.min(filterProbes(probes, nextFilters).length, MAX_TRACE_PROBES);
    if (nextLimit > limit) {
      setLimit(nextLimit);
    }
  }, [limit, probes]);

  const pickProbe = useCallback((probe: GlobalpingProbe) => {
    if (!mapSelectionActive) resetMapSelectionLimitTracking();
    const nextFilters = { magic: probeToMagic(probe) };
    setFilters(nextFilters);
    expandLimitForExplicitFilters(nextFilters);
    setMapSelectionActive(true);
    setSelectionNotice(`已选择 ${probe.location.city || probe.location.country} · AS${probe.location.asn}`);
  }, [expandLimitForExplicitFilters, mapSelectionActive, resetMapSelectionLimitTracking]);

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
    expandLimitForExplicitFilters(nextFilters);
    setSelectionNotice("");
    setMapSelectionActive(false);
    resetMapSelectionLimitTracking();
  }, [expandLimitForExplicitFilters, resetMapSelectionLimitTracking]);

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

  const saveNexttraceToken = useCallback(() => {
    const trimmed = nexttraceTokenDraft.trim();
    setNexttraceToken(trimmed);
    setNexttraceTokenDraft(trimmed);
    writeStoredNexttraceToken(trimmed);
    if (trimmed && result?.status === "finished" && result.measurementId) {
      void loadTrace(result.measurementId, false, globalpingToken, trimmed, "created", "nexttraceToken");
    }
  }, [globalpingToken, loadTrace, nexttraceTokenDraft, result]);

  const clearNexttraceToken = useCallback(() => {
    setNexttraceToken("");
    setNexttraceTokenDraft("");
    writeStoredNexttraceToken("");
  }, []);

  const saveNexttraceTokenAndContinue = useCallback((token: string) => {
    const trimmed = token.trim();
    if (!trimmed || !turnstileGate) return;

    const gate = turnstileGate;
    setNexttraceToken(trimmed);
    setNexttraceTokenDraft(trimmed);
    writeStoredNexttraceToken(trimmed);
    setTurnstileGate(null);
    setMessage("");

    if (gate.kind === "shared") {
      sharedTraceStartedRef.current = gate.measurementId;
      void loadTrace(gate.measurementId, true, globalpingToken, trimmed, "shared", "nexttraceToken");
      return;
    }
    void createAndLoadTrace("", "nexttraceToken", trimmed);
  }, [createAndLoadTrace, globalpingToken, loadTrace, turnstileGate]);

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
          nexttraceTokenDraft={nexttraceTokenDraft}
          nexttraceTokenSaved={Boolean(nexttraceToken)}
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
          onNexttraceTokenDraftChange={setNexttraceTokenDraft}
          onSaveNexttraceToken={saveNexttraceToken}
          onClearNexttraceToken={clearNexttraceToken}
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
            nexttraceTokenDraft={nexttraceTokenDraft}
            onToken={handleTurnstileToken}
            onSaveNexttraceToken={saveNexttraceTokenAndContinue}
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
  nexttraceTokenDraft,
  onToken,
  onSaveNexttraceToken,
  onCancel,
}: {
  gate: TurnstileGate;
  siteKey: string;
  nexttraceTokenDraft: string;
  onToken: (token: string) => void;
  onSaveNexttraceToken: (token: string) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"turnstile" | "nexttraceToken">("turnstile");
  const [draft, setDraft] = useState(nexttraceTokenDraft);
  const title = gate.kind === "shared" ? "验证后打开分享结果" : "验证后开始诊断";
  const description = gate.kind === "shared" ? "完成 Turnstile 后会自动读取 measurement 并展示结果。" : "完成 Turnstile 后会自动创建并运行诊断。";
  const tokenDescription =
    gate.kind === "shared"
      ? "保存后会用该 Token 直连 NextTrace 并打开分享结果。"
      : "保存后会用该 Token 直连 NextTrace 并开始诊断。";
  const trimmedDraft = draft.trim();

  return (
    <div className="turnstile-overlay">
      <LiquidGlassSurface variant="toolbar" fullWidth className="turnstile-dialog-surface">
        <section role="dialog" aria-modal="true" aria-labelledby="turnstile-dialog-title">
          <div className="turnstile-dialog">
            <div className="turnstile-dialog-copy">
              <h2 id="turnstile-dialog-title">{mode === "nexttraceToken" ? "使用 NextTrace API Token" : title}</h2>
              <p>{mode === "nexttraceToken" ? tokenDescription : description}</p>
            </div>
            {mode === "nexttraceToken" ? (
              <div className="turnstile-token-form">
                <label className="field-label">
                  <span>NextTrace API Token</span>
                  <Input
                    type="password"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="输入你的 NextTrace API Token"
                    autoComplete="off"
                    aria-label="弹窗 NextTrace API Token"
                  />
                </label>
                <a className="token-help-link" href={NEXTTRACE_API_TOKEN_URL} target="_blank" rel="noreferrer">
                  获取 NextTrace API Token
                </a>
              </div>
            ) : (
              <TurnstileBox siteKey={siteKey} onToken={onToken} />
            )}
            <div className="turnstile-dialog-actions">
              {mode === "nexttraceToken" ? (
                <>
                  <Button
                    variant="glass"
                    size="sm"
                    className="turnstile-cancel-button"
                    type="button"
                    onClick={() => onSaveNexttraceToken(trimmedDraft)}
                    disabled={!trimmedDraft}
                  >
                    保存并继续
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="turnstile-cancel-button"
                    type="button"
                    onClick={() => setMode("turnstile")}
                  >
                    返回验证
                  </Button>
                  <Button variant="secondary" size="sm" className="turnstile-cancel-button" type="button" onClick={onCancel}>
                    取消
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="glass"
                    size="sm"
                    className="turnstile-cancel-button"
                    type="button"
                    onClick={() => setMode("nexttraceToken")}
                  >
                    使用 NextTrace API Token
                  </Button>
                  <Button variant="secondary" size="sm" className="turnstile-cancel-button" type="button" onClick={onCancel}>
                    取消
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>
      </LiquidGlassSurface>
    </div>
  );
}

function SharedResultLoading({ measurementId }: { measurementId: string }) {
  return (
    <Surface asChild className="shared-result-loading">
      <section role="status" aria-live="polite" aria-label="正在打开分享结果">
        <Loader2 size={24} className="spin" />
        <div>
          <h2>正在打开分享结果</h2>
          <p>正在读取 Globalping measurement，完成后会自动展示结果。</p>
          <span>{measurementId}</span>
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

function hasExplicitFilter(filters: TraceFilters): boolean {
  return Boolean(
    filters.country?.trim() ||
      filters.city?.trim() ||
      filters.asn?.trim() ||
      filters.network?.trim() ||
      filters.tag?.trim() ||
      filters.eyeball ||
      filters.datacenter ||
      (filters.magic?.trim() && filters.magic.trim().toLowerCase() !== "world"),
  );
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

function readStoredNexttraceToken(): string {
  try {
    return window.localStorage.getItem(NEXTTRACE_TOKEN_STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function writeStoredNexttraceToken(token: string): void {
  try {
    if (token) {
      window.localStorage.setItem(NEXTTRACE_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(NEXTTRACE_TOKEN_STORAGE_KEY);
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
