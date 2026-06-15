import { AlertCircle, Eye, Loader2, Map as MapIcon, Table2 } from "lucide-react";
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  fetchBackgroundImage,
  fetchConfig,
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
} from "./components/LiquidGlassSurface";
import { ProbeTable } from "./components/ProbeTable";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Surface } from "./components/ui/surface";
import type { MapProjection, ResultContentOrder } from "./components/mapProjection";
import type { ProbeMapAsnSelection } from "./components/ProbeMap";
import { deferUntilIdle } from "./lib/defer";
import { usePersistentAppSettings } from "./hooks/usePersistentAppSettings";
import {
  useTraceLifecycle,
  userFacingErrorMessage,
  type MeasurementLoadingState,
  type WorkspaceMode,
} from "./hooks/useTraceLifecycle";
import { enrichTraceWithNexttraceToken } from "./nexttraceGeo";
import {
  appendMagicFilters,
  filterChips,
  filterProbes,
  magicFromSelectedProbes,
  normalizeMagicFiltersForProbes,
  probeFilterSuggestions,
  probeToMagic,
} from "../shared/filters";
import {
  DEFAULT_MAP_STYLE_URL,
  DEFAULT_PROBE_LIMIT,
  DEFAULT_TRACE_PACKETS,
  MAX_TRACE_PACKETS,
  MAX_TRACE_PROBES,
  MIN_TRACE_PACKETS,
  type GlobalpingLimitResponse,
  type GlobalpingProbe,
  type TraceFilters,
  type TraceProtocol,
  type TraceResultResponse,
} from "../shared/types";
import "./styles.css";

export { ENRICH_AFTER_FINISHED_DELAY_MS, POLL_DELAY_MS, TRACE_MAX_POLL_ATTEMPTS } from "./hooks/useTraceLifecycle";
const PROBE_MAP_BROWSER_DELAY_MS = 800;
const GLOBALPING_TOKEN_STORAGE_KEY = "globaltrace.globalpingToken";
const NEXTTRACE_TOKEN_STORAGE_KEY = "globaltrace.nexttraceApiToken";
const TRACE_PORT_STORAGE_KEY = "globaltrace.tracePort";
const TRACE_PACKETS_STORAGE_KEY = "globaltrace.tracePackets";

type AppRoute = "/" | "/about";

interface StoredTokenState {
  token: string;
  remembered: boolean;
}

const AboutPage = lazy(() => import("./components/AboutPage").then((module) => ({ default: module.AboutPage })));
const ProbeMap = lazy(() => import("./components/ProbeMap").then((module) => ({ default: module.ProbeMap })));
const ResultsView = lazy(() => import("./components/ResultsView").then((module) => ({ default: module.ResultsView })));

export function App() {
  const [route, setRoute] = useState<AppRoute>(currentRoute);
  const {
    themeMode,
    liquidGlassEnabled,
    liquidGlassIntensity,
    resultMapProjection,
    setResultMapProjection,
    resultContentOrder,
    resultContentOrderPromptOpen,
    cycleThemeMode,
    updateLiquidGlassEnabled,
    updateLiquidGlassIntensity,
    updateResultContentOrder,
  } = usePersistentAppSettings();
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
  const [ipVersion, setIpVersion] = useState<IpVersionSelection>(4);
  const [port, setPort] = useState(readStoredTracePort);
  const [packets, setPackets] = useState(readStoredTracePackets);
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
  const bootstrappedRef = useRef(false);
  const mapSelectionLimitBeforeRef = useRef<number | null>(null);
  const mapSelectionLimitManuallyChangedRef = useRef(false);
  const {
    abortTraceLoading,
    cancelMeasurementLoading,
    createdMeasurementIdRef,
    createAndLoadTrace,
    loadTrace,
    sharedTraceStartedRef,
  } = useTraceLifecycle({
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
  });

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
  const diagnosisControlLabel = nexttraceToken
    ? "NextTrace API Token 直连已启用"
    : "Globalping credits 控制诊断创建";

  useEffect(() => {
    const onPopState = () => setRoute(currentRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

  useEffect(() => {
    if (route !== "/" || !configReady) return;
    const id = new URL(window.location.href).searchParams.get("measurement");
    if (!id || id === createdMeasurementIdRef.current) return;
    if (sharedTraceStartedRef.current === id) return;
    if (hasReusableSharedResult(result, id)) return;
    sharedTraceStartedRef.current = id;
    void loadTrace(id, true, "", "", "shared");
  }, [configReady, loadTrace, result, route]);

  useEffect(() => () => abortTraceLoading(), [abortTraceLoading]);

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

  const appendSelectionFilters = useCallback((additions: string | string[]) => {
    const nextFilters = appendMagicFilters(filters, additions, MAX_TRACE_PROBES);
    setFilters(nextFilters);
    expandLimitForExplicitFilters(nextFilters);
    return nextFilters;
  }, [expandLimitForExplicitFilters, filters]);

  const pickProbe = useCallback((probe: GlobalpingProbe) => {
    if (!mapSelectionActive) resetMapSelectionLimitTracking();
    appendSelectionFilters(probeToMagic(probe));
    setMapSelectionActive(true);
    setSelectionNotice(`已添加 ${probe.location.city || probe.location.country} · AS${probe.location.asn}`);
  }, [appendSelectionFilters, mapSelectionActive, resetMapSelectionLimitTracking]);

  const pickMapAsn = useCallback((selection: ProbeMapAsnSelection) => {
    if (!mapSelectionActive) resetMapSelectionLimitTracking();
    appendSelectionFilters(selection.magic);
    setMapSelectionActive(true);
    setSelectionNotice(`已添加 ${selection.city || selection.country} · ${selection.asn}`);
  }, [appendSelectionFilters, mapSelectionActive, resetMapSelectionLimitTracking]);

  const boxSelect = useCallback((selected: GlobalpingProbe[]) => {
    if (!selected.length) {
      setSelectionNotice("框选范围内没有可用 probe");
      return;
    }
    const selection = magicFromSelectedProbes(selected, 10);
    if (!mapSelectionActive || mapSelectionLimitManuallyChangedRef.current || mapSelectionLimitBeforeRef.current === null) {
      mapSelectionLimitBeforeRef.current = limit;
    }
    mapSelectionLimitManuallyChangedRef.current = false;
    appendSelectionFilters(selection.magic);
    setLimit(Math.max(1, selection.selectedCount));
    setMapSelectionActive(true);
    setSelectionNotice(
      selection.capped
        ? `已添加框选 ${selected.length} 个 probes，保留最近 10 个`
        : `已添加框选 ${selection.selectedCount} 个 probes`,
    );
  }, [appendSelectionFilters, limit, mapSelectionActive]);

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
    writeStoredTracePort("");
    setPackets(DEFAULT_TRACE_PACKETS);
    writeStoredTracePackets(DEFAULT_TRACE_PACKETS);
    setProtocol("ICMP");
    setIpVersion(4);
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

  const handlePortChange = useCallback((nextPort: string) => {
    setPort(nextPort);
    writeStoredTracePort(nextPort);
  }, []);

  const handlePacketsChange = useCallback((nextPackets: number) => {
    setPackets(nextPackets);
    writeStoredTracePackets(nextPackets);
  }, []);

  const showResult = useCallback(() => {
    if (finalResult) setWorkspaceMode("result");
  }, [finalResult]);

  const closeResult = useCallback(() => {
    setWorkspaceMode("select");
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

  const navigateAbout = useCallback(() => {
    window.history.pushState(null, "", "/about");
    setRoute("/about");
  }, []);

  const navigateHome = useCallback(() => {
    abortTraceLoading();
    window.history.pushState(null, "", "/");
    setWorkspaceMode("select");
    setMeasurementLoading(null);
    sharedTraceStartedRef.current = "";
    setMessage("");
    setLoading(false);
    setRoute("/");
  }, [abortTraceLoading, sharedTraceStartedRef]);

  return (
    <LiquidGlassPreferenceProvider enabled={liquidGlassEnabled} intensity={liquidGlassIntensity}>
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
          liquidGlassIntensity={liquidGlassIntensity}
          resultContentOrder={resultContentOrder}
          onTargetChange={setTarget}
          onProtocolChange={setProtocol}
          onIpVersionChange={setIpVersion}
          onPortChange={handlePortChange}
          onPacketsChange={handlePacketsChange}
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
          onLiquidGlassIntensityChange={updateLiquidGlassIntensity}
          onResultContentOrderChange={updateResultContentOrder}
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
              </div>
              <div className="status-actions">
                <Badge variant="accent" className="quota-chip">
                  <span className="quota-chip-title">{diagnosisControlLabel}</span>
                  <span className="quota-chip-detail">{quotaLabel}</span>
                </Badge>
                {finalResult && workspaceMode === "select" && (
                  <LiquidGlassSurface
                    variant="button"
                    interactive
                    className="result-command-surface status-action-surface"
                    onClick={showResult}
                    ariaLabel="查看结果"
                  >
                    <Button variant="glass" size="sm" className="result-command-button status-action-button" asChild>
                      <span>
                        <Eye size={16} />
                        查看结果
                      </span>
                    </Button>
                  </LiquidGlassSurface>
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
                    probes={probes}
                    status={probesStatus}
                    selectionActive={mapSelectionActive}
                    mapStyleUrl={config.mapStyleUrl}
                    onPickAsn={pickMapAsn}
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
              resultContentOrder={resultContentOrder}
              onClose={closeResult}
            />
          </Suspense>
        ) : (
          <ResultsViewFallback />
        )}
      </GlassOverlay>

      <ResultContentOrderDialog
        open={resultContentOrderPromptOpen}
        onSelect={updateResultContentOrder}
      />
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

function ResultContentOrderDialog({
  open,
  onSelect,
}: {
  open: boolean;
  onSelect: (value: ResultContentOrder) => void;
}) {
  return (
    <GlassOverlay
      open={open}
      title="结果页面显示顺序"
      size="compact"
      placement="center"
      dismissible={false}
      priority="blocking"
      className="result-layout-choice-panel"
      surfaceCornerRadius={18}
      onClose={() => undefined}
    >
      <section className="result-layout-choice" aria-label="结果页面显示顺序">
        <p>后续如果还想改，可以在高级参数中修改。</p>
        <div className="result-layout-choice-actions" aria-label="结果页面显示顺序">
          <LiquidGlassSurface variant="button" interactive actionRole="none" cornerRadius={14} className="result-layout-choice-surface">
            <Button variant="glass" type="button" className="result-layout-choice-button" onClick={() => onSelect("map-first")}>
              <MapIcon size={16} aria-hidden="true" />
              地图优先
            </Button>
          </LiquidGlassSurface>
          <LiquidGlassSurface variant="button" interactive actionRole="none" cornerRadius={14} className="result-layout-choice-surface">
            <Button variant="glass" type="button" className="result-layout-choice-button" onClick={() => onSelect("table-first")}>
              <Table2 size={16} aria-hidden="true" />
              表格优先
            </Button>
          </LiquidGlassSurface>
        </div>
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

function readStoredTracePort(): string {
  try {
    return window.localStorage.getItem(TRACE_PORT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredTracePort(port: string): void {
  try {
    if (port === "") {
      window.localStorage.removeItem(TRACE_PORT_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(TRACE_PORT_STORAGE_KEY, port);
  } catch {
    // Trace parameter persistence is best-effort.
  }
}

function readStoredTracePackets(): number {
  try {
    const stored = Number(window.localStorage.getItem(TRACE_PACKETS_STORAGE_KEY));
    if (Number.isInteger(stored) && stored >= MIN_TRACE_PACKETS && stored <= MAX_TRACE_PACKETS) {
      return stored;
    }
  } catch {
    // Trace parameter persistence is best-effort.
  }
  return DEFAULT_TRACE_PACKETS;
}

function writeStoredTracePackets(packets: number): void {
  try {
    if (packets === DEFAULT_TRACE_PACKETS) {
      window.localStorage.removeItem(TRACE_PACKETS_STORAGE_KEY);
      return;
    }
    if (!Number.isInteger(packets) || packets < MIN_TRACE_PACKETS || packets > MAX_TRACE_PACKETS) {
      window.localStorage.removeItem(TRACE_PACKETS_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(TRACE_PACKETS_STORAGE_KEY, String(packets));
  } catch {
    // Trace parameter persistence is best-effort.
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
