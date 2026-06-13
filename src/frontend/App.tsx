import { AlertCircle, Eye, Loader2 } from "lucide-react";
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  createTrace,
  enrichTrace,
  fetchBackgroundImage,
  fetchCachedTrace,
  fetchConfig,
  fetchGlobalpingMeasurement,
  fetchLimits,
  fetchProbes,
  type AppConfig,
  type BackgroundImage,
} from "./api";
import { FilterPanel, type IpVersionSelection } from "./components/FilterPanel";
import { GlassOverlay } from "./components/GlassOverlay";
import {
  LiquidGlassPreferenceProvider,
  LiquidGlassSurface,
  readStoredLiquidGlassEnabled,
  writeStoredLiquidGlassEnabled,
} from "./components/LiquidGlassSurface";
import { ProbeTable } from "./components/ProbeTable";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Surface } from "./components/ui/surface";
import type { MapProjection } from "./components/mapProjection";
import { deferUntilIdle } from "./lib/defer";
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
import type { GlobalpingMeasurement } from "../shared/globalping";
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

export const POLL_DELAY_MS = 1000;
export const ENRICH_AFTER_FINISHED_DELAY_MS = 500;
export const TRACE_MAX_POLL_ATTEMPTS = 120;
const PROBE_MAP_BROWSER_DELAY_MS = 800;
const GLOBALPING_TOKEN_STORAGE_KEY = "globaltrace.globalpingToken";
const NEXTTRACE_TOKEN_STORAGE_KEY = "globaltrace.nexttraceApiToken";
const THEME_STORAGE_KEY = "globaltrace.themeMode";
const RESULT_MAP_PROJECTION_STORAGE_KEY = "globaltrace.viewMode";

type WorkspaceMode = "select" | "result";
type AppRoute = "/" | "/about";
type TraceLoadSource = "created" | "shared";
type TraceEnrichmentMode = "worker" | "nexttraceToken";

interface MeasurementLoadingState {
  source: TraceLoadSource;
  measurementId?: string;
}

interface StoredTokenState {
  token: string;
  remembered: boolean;
}

const AboutPage = lazy(() => import("./components/AboutPage").then((module) => ({ default: module.AboutPage })));
const ProbeMap = lazy(() => import("./components/ProbeMap").then((module) => ({ default: module.ProbeMap })));
const ResultsView = lazy(() => import("./components/ResultsView").then((module) => ({ default: module.ResultsView })));

export function App() {
  const [route, setRoute] = useState<AppRoute>(currentRoute);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readStoredThemeMode);
  const [liquidGlassEnabled, setLiquidGlassEnabled] = useState(readStoredLiquidGlassEnabled);
  const [resultMapProjection, setResultMapProjection] = useState<MapProjection>(readStoredResultMapProjection);
  const [backgroundImage, setBackgroundImage] = useState<BackgroundImage | null>(null);
  const [storedGlobalpingToken] = useState(readStoredGlobalpingToken);
  const [globalpingToken, setGlobalpingToken] = useState(storedGlobalpingToken.token);
  const [globalpingTokenRemembered, setGlobalpingTokenRemembered] = useState(storedGlobalpingToken.remembered);
  const [globalpingTokenDraft, setGlobalpingTokenDraft] = useState(globalpingToken);
  const [storedNexttraceToken] = useState(readStoredNexttraceToken);
  const [nexttraceToken, setNexttraceToken] = useState(storedNexttraceToken.token);
  const [nexttraceTokenRemembered, setNexttraceTokenRemembered] = useState(storedNexttraceToken.remembered);
  const [nexttraceTokenDraft, setNexttraceTokenDraft] = useState(nexttraceToken);
  const [config, setConfig] = useState<AppConfig>({
    mapStyleUrl: import.meta.env.VITE_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL,
  });
  const [target, setTarget] = useState("globalping.io");
  const [protocol, setProtocol] = useState<TraceProtocol>("ICMP");
  const [ipVersion, setIpVersion] = useState<IpVersionSelection>("");
  const [port, setPort] = useState("");
  const [packets, setPackets] = useState(3);
  const [limit, setLimit] = useState(DEFAULT_PROBE_LIMIT);
  const [filters, setFilters] = useState<TraceFilters>({ magic: "world" });
  const [configReady, setConfigReady] = useState(false);
  const [probes, setProbes] = useState<GlobalpingProbe[]>([]);
  const [probesStatus, setProbesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [limits, setLimits] = useState<GlobalpingLimitResponse | null>(null);
  const [limitsStatus, setLimitsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [result, setResult] = useState<TraceResultResponse | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("select");
  const [loading, setLoading] = useState(false);
  const [measurementLoading, setMeasurementLoading] = useState<MeasurementLoadingState | null>(null);
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
  const resultPriority = workspaceMode === "result" || Boolean(measurementLoading);
  const canSubmit = configReady;
  const deferredFilters = useDeferredValue(filters);
  const filteredProbes = useMemo(() => filterProbes(probes, deferredFilters), [deferredFilters, probes]);
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
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void bootstrap();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchBackgroundImage().then((image) => {
      if (!cancelled) setBackgroundImage(image);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("ambient-photo-ready", Boolean(backgroundImage));
    return () => document.documentElement.classList.remove("ambient-photo-ready");
  }, [backgroundImage]);

  useEffect(() => {
    if (probeMapReady || probesStatus === "loading") return;
    return deferProbeMapLoad(() => setProbeMapReady(true));
  }, [probeMapReady, probesStatus]);

  useEffect(() => {
    return deferUntilIdle(() => {
      void loadLimits(globalpingToken);
    });
  }, [globalpingToken]);

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
  }, []);

  useEffect(() => {
    if (route !== "/" || !configReady) return;
    const id = new URL(window.location.href).searchParams.get("measurement");
    if (!id || id === createdMeasurementIdRef.current) return;
    if (sharedTraceStartedRef.current === id) return;
    if (hasReusableSharedResult(result, id)) return;
    sharedTraceStartedRef.current = id;
    void loadTrace(id, true, "", "", "shared");
  }, [configReady, loadTrace, result, route]);

  useEffect(() => () => pollAbortRef.current?.abort(), []);

  const bootstrap = async () => {
    const nextConfig = await fetchConfig().catch(() => null);
    if (nextConfig) {
      setConfig((current) => ({
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
          ipVersion: ipVersion || undefined,
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
  }, [filters, globalpingToken, ipVersion, limit, loadTrace, packets, port, probes, protocol, target]);

  const submit = useCallback(() => {
    if (!configReady) return;
    if (nexttraceToken) {
      void createAndLoadTrace("nexttraceToken", nexttraceToken);
      return;
    }
    void createAndLoadTrace();
  }, [configReady, createAndLoadTrace, nexttraceToken]);

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
    setMeasurementLoading(null);
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
  }, []);

  const cancelMeasurementLoading = useCallback(() => {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    setLoading(false);
    setMeasurementLoading(null);
    setWorkspaceMode("select");
    setMessage("");
    sharedTraceStartedRef.current = "";
  }, []);

  const saveGlobalpingToken = useCallback(() => {
    const trimmed = globalpingTokenDraft.trim();
    setGlobalpingToken(trimmed);
    setGlobalpingTokenDraft(trimmed);
    writeStoredGlobalpingToken(trimmed, globalpingTokenRemembered);
  }, [globalpingTokenDraft, globalpingTokenRemembered]);

  const clearGlobalpingToken = useCallback(() => {
    setGlobalpingToken("");
    setGlobalpingTokenDraft("");
    clearStoredToken(GLOBALPING_TOKEN_STORAGE_KEY);
  }, []);

  const updateGlobalpingTokenRemembered = useCallback((remembered: boolean) => {
    setGlobalpingTokenRemembered(remembered);
    writeStoredGlobalpingToken(globalpingToken, remembered);
  }, [globalpingToken]);

  const saveNexttraceToken = useCallback(() => {
    const trimmed = nexttraceTokenDraft.trim();
    setNexttraceToken(trimmed);
    setNexttraceTokenDraft(trimmed);
    writeStoredNexttraceToken(trimmed, nexttraceTokenRemembered);
    if (trimmed && result?.status === "finished" && result.measurementId) {
      setLoading(true);
      void enrichTraceWithNexttraceToken(result, trimmed)
        .then((enriched) => {
          setResult(enriched);
          setMessage("");
          setWorkspaceMode("result");
        })
        .catch((error: unknown) => {
          setMessage(userFacingErrorMessage(error, "加载 measurement 失败"));
        })
        .finally(() => setLoading(false));
    }
  }, [nexttraceTokenDraft, nexttraceTokenRemembered, result]);

  const clearNexttraceToken = useCallback(() => {
    setNexttraceToken("");
    setNexttraceTokenDraft("");
    clearStoredToken(NEXTTRACE_TOKEN_STORAGE_KEY);
  }, []);

  const updateNexttraceTokenRemembered = useCallback((remembered: boolean) => {
    setNexttraceTokenRemembered(remembered);
    writeStoredNexttraceToken(nexttraceToken, remembered);
  }, [nexttraceToken]);

  const cycleThemeMode = useCallback(() => {
    setThemeMode((current) => nextThemeMode(current));
  }, []);

  const updateLiquidGlassEnabled = useCallback((enabled: boolean) => {
    setLiquidGlassEnabled(enabled);
    writeStoredLiquidGlassEnabled(enabled);
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
    setMeasurementLoading(null);
    sharedTraceStartedRef.current = "";
    setMessage("");
    setLoading(false);
    setRoute("/");
  }, []);

  return (
    <LiquidGlassPreferenceProvider enabled={liquidGlassEnabled}>
      <BackgroundLayer backgroundImage={backgroundImage} />
      <main className={`app-shell${backgroundImage ? " ambient-photo-ready" : ""}${resultPriority ? " result-priority" : ""}`}>
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
          canSubmit={canSubmit}
          globalpingTokenDraft={globalpingTokenDraft}
          globalpingTokenSaved={Boolean(globalpingToken)}
          globalpingTokenRemembered={globalpingTokenRemembered}
          nexttraceTokenDraft={nexttraceTokenDraft}
          nexttraceTokenSaved={Boolean(nexttraceToken)}
          nexttraceTokenRemembered={nexttraceTokenRemembered}
          themeMode={themeMode}
          liquidGlassEnabled={liquidGlassEnabled}
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
          onGlobalpingTokenRememberedChange={updateGlobalpingTokenRemembered}
          onNexttraceTokenDraftChange={setNexttraceTokenDraft}
          onSaveNexttraceToken={saveNexttraceToken}
          onClearNexttraceToken={clearNexttraceToken}
          onNexttraceTokenRememberedChange={updateNexttraceTokenRemembered}
          onCycleThemeMode={cycleThemeMode}
          onLiquidGlassEnabledChange={updateLiquidGlassEnabled}
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

          <div className="workspace-content">
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
          </div>
        </div>
      </main>

      <GlassOverlay
        open={route === "/about"}
        title="关于 GlobalTrace"
        size="about"
        chrome="bare"
        placement="center"
        onClose={navigateHome}
      >
        <Suspense fallback={<AboutPageFallback />}>
          <AboutPage onBack={navigateHome} backgroundImage={backgroundImage} />
        </Suspense>
      </GlassOverlay>

      <MeasurementLoadingDialog
        open={Boolean(measurementLoading)}
        measurementId={measurementLoading?.measurementId}
        onCancel={cancelMeasurementLoading}
      />

      <GlassOverlay
        open={workspaceMode === "result" && Boolean(finalResult)}
        title="诊断结果"
        size="result"
        chrome="bare"
        placement="center"
        onClose={closeResult}
      >
        {finalResult ? (
          <Suspense fallback={<ResultsViewFallback />}>
            <ResultsView
              result={finalResult}
              mapStyleUrl={config.mapStyleUrl}
              mapProjection={resultMapProjection}
              onMapProjectionChange={setResultMapProjection}
              onClose={closeResult}
            />
          </Suspense>
        ) : (
          <ResultsViewFallback />
        )}
      </GlassOverlay>
    </LiquidGlassPreferenceProvider>
  );
}

function BackgroundLayer({ backgroundImage }: { backgroundImage: BackgroundImage | null }) {
  if (!backgroundImage) return null;
  const style = {
    "--ambient-background-image": `url("${backgroundImage.imageUrl}")`,
  } as CSSProperties;
  return <div className="ambient-background" style={style} aria-hidden="true" />;
}

function AboutPageFallback() {
  return (
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

function MeasurementLoadingDialog({
  open,
  measurementId,
  onCancel,
}: {
  open: boolean;
  measurementId?: string;
  onCancel: () => void;
}) {
  return (
    <GlassOverlay open={open} title="读取诊断结果" size="compact" placement="center" onClose={onCancel}>
      <section className="measurement-loading" role="status" aria-live="polite" aria-label="正在读取 measurement">
        <Loader2 size={24} className="spin" />
        <p>正在读取 Globalping measurement，完成后会自动展示结果。</p>
        {measurementId && <span>{measurementId}</span>}
      </section>
    </GlassOverlay>
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

function readStoredGlobalpingToken(): StoredTokenState {
  return readStoredToken(GLOBALPING_TOKEN_STORAGE_KEY);
}

function writeStoredGlobalpingToken(token: string, remembered: boolean): void {
  writeStoredToken(GLOBALPING_TOKEN_STORAGE_KEY, token, remembered);
}

function readStoredNexttraceToken(): StoredTokenState {
  return readStoredToken(NEXTTRACE_TOKEN_STORAGE_KEY);
}

function writeStoredNexttraceToken(token: string, remembered: boolean): void {
  writeStoredToken(NEXTTRACE_TOKEN_STORAGE_KEY, token, remembered);
}

function readStoredToken(key: string): StoredTokenState {
  const localToken = readStorageValue(window.localStorage, key);
  if (localToken) return { token: localToken, remembered: true };
  return { token: readStorageValue(window.sessionStorage, key), remembered: false };
}

function readStorageValue(storage: Storage, key: string): string {
  try {
    return storage.getItem(key)?.trim() || "";
  } catch {
    return "";
  }
}

function writeStoredToken(key: string, token: string, remembered: boolean): void {
  clearStoredToken(key);
  if (!token) return;
  try {
    const storage = remembered ? window.localStorage : window.sessionStorage;
    storage.setItem(key, token);
  } catch {
    // Ignore storage failures; the token still works for the current tab.
  }
}

function clearStoredToken(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures; the token still works for the current tab.
  }
  try {
    window.sessionStorage.removeItem(key);
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

function deferProbeMapLoad(callback: () => void): () => void {
  if (!("requestIdleCallback" in window) || typeof window.requestIdleCallback !== "function") {
    return deferUntilIdle(callback);
  }
  let timerId: number | undefined;
  const cancelIdle = deferUntilIdle(() => {
    timerId = window.setTimeout(callback, PROBE_MAP_BROWSER_DELAY_MS);
  });
  return () => {
    cancelIdle();
    if (timerId !== undefined) window.clearTimeout(timerId);
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

function userFacingErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (/parameter validation failed/i.test(message)) {
    return `Globalping 筛选条件无效：${message} 请重置筛选，或改用国家/地区、城市、ASN 等较短条件。`;
  }
  return message;
}
