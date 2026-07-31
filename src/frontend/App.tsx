import { AlertCircle, List, Loader2, Map as MapIcon, Table2 } from "lucide-react";
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
import { Overlay } from "./components/Overlay";
import { ProbeListDrawer } from "./components/ProbeListDrawer";
import { ProbeTable } from "./components/ProbeTable";
import { ResultSlideover } from "./components/ResultSlideover";
import { Button } from "./components/ui/button";
import { Surface } from "./components/ui/surface";
import type { ResultContentOrder } from "./components/mapProjection";
import type { ProbeMapAsnSelection } from "./components/ProbeMap";
import type { QuotaState } from "./components/filter-panel/QuotaMeter";
import { I18nProvider, messagesByLocale, useI18n } from "./i18n";
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
  removeMagicFilters,
  filterChips,
  filterProbes,
  magicFromSelectedProbes,
  normalizeAsn,
  probeFilterSuggestions,
  probeMatchesFilters,
  probeToMagic,
  splitMagicList,
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
const PROBE_DRAWER_ID = "probe-list-drawer";

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
    resultMapProjection,
    setResultMapProjection,
    resultContentOrder,
    resultContentOrderPromptOpen,
    locale,
    cycleThemeMode,
    updateResultContentOrder,
    updateLocale,
  } = usePersistentAppSettings();
  const messages = messagesByLocale[locale];
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
  const [browseAllProbes, setBrowseAllProbes] = useState(false);
  const [listFilterActive, setListFilterActive] = useState(false);
  const [mapFocusProbe, setMapFocusProbe] = useState<GlobalpingProbe | null>(null);
  const [mapFocusToken, setMapFocusToken] = useState(0);
  const [mapFitToken, setMapFitToken] = useState(0);
  const [probeDrawerOpen, setProbeDrawerOpen] = useState(false);
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
    messages,
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
  const immersiveMap = resultContentOrder === "map-first";
  const resultSlideoverOpen = workspaceMode === "result" && Boolean(finalResult);
  const canSubmit = configReady;
  const deferredFilters = useDeferredValue(filters);
  const filteredProbes = useMemo(() => filterProbes(probes, deferredFilters), [deferredFilters, probes]);
  const selectedProbeMagic = useMemo(() => {
    if (!mapSelectionActive) return [] as string[];
    const magic = (filters.magic || "").trim();
    if (!magic || magic.toLowerCase() === "world") return [] as string[];
    return splitMagicList(magic);
  }, [filters.magic, mapSelectionActive]);
  const addedProbes = useMemo(() => {
    if (!selectedProbeMagic.length) return [] as GlobalpingProbe[];
    return probes.filter((probe) =>
      selectedProbeMagic.some((magic) => probeMatchesFilters(probe, { magic })),
    );
  }, [probes, selectedProbeMagic]);
  const tableProbes = useMemo(() => {
    if (mapSelectionActive && browseAllProbes) return probes;
    if (mapSelectionActive) return addedProbes;
    return filteredProbes;
  }, [addedProbes, browseAllProbes, filteredProbes, mapSelectionActive, probes]);
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
  const chips = useMemo(() => filterChips(filters, messages.filterChipLabels), [filters, messages]);
  const quota = useMemo<QuotaState>(() => ({
    status: limitsStatus === "ready" && limits ? "ready" : limitsStatus,
    remaining: limits?.measurements.create.remaining ?? 0,
    limit: limits?.measurements.create.limit ?? 0,
    actor: globalpingToken ? "Globalping Token" : messages.currentIp,
    modeLabel: nexttraceToken
      ? messages.nexttraceDirectEnabled
      : messages.globalpingCreditsControl,
  }), [globalpingToken, limits, limitsStatus, messages, nexttraceToken]);

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
      setMessage(userFacingErrorMessage(error, messages.initFailed, messages));
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

  // List-row filters use country/city/asn for browsing only; do not promote them into magic selection.
  const selectionFilterBase = useCallback((): TraceFilters => {
    if (listFilterActive) {
      return { magic: mapSelectionActive ? filters.magic || "world" : "world" };
    }
    return filters;
  }, [filters, listFilterActive, mapSelectionActive]);

  const appendSelectionFilters = useCallback((additions: string | string[]) => {
    const nextFilters = appendMagicFilters(selectionFilterBase(), additions, MAX_TRACE_PROBES);
    setFilters(nextFilters);
    expandLimitForExplicitFilters(nextFilters);
    setListFilterActive(false);
    return nextFilters;
  }, [expandLimitForExplicitFilters, selectionFilterBase]);

  const pickProbe = useCallback((probe: GlobalpingProbe) => {
    if (!mapSelectionActive) resetMapSelectionLimitTracking();
    appendSelectionFilters(probeToMagic(probe));
    setBrowseAllProbes(false);
    setMapSelectionActive(true);
    setSelectionNotice(messages.addedProbe(probe.location.city || probe.location.country, probe.location.asn));
  }, [appendSelectionFilters, mapSelectionActive, messages, resetMapSelectionLimitTracking]);

  const focusProbeOnMap = useCallback((probe: GlobalpingProbe) => {
    setMapFocusProbe(probe);
    setMapFocusToken((token) => token + 1);
  }, []);

  const pickMapAsn = useCallback((selection: ProbeMapAsnSelection) => {
    if (!mapSelectionActive) resetMapSelectionLimitTracking();
    appendSelectionFilters(selection.magic);
    setBrowseAllProbes(false);
    setMapSelectionActive(true);
    setSelectionNotice(messages.addedProbe(selection.city || selection.country, selection.asn.replace(/^AS/i, "")));
  }, [appendSelectionFilters, mapSelectionActive, messages, resetMapSelectionLimitTracking]);

  const applyRemovedMagicFilters = useCallback((removals: string | string[]) => {
    const nextFilters = removeMagicFilters(filters, removals);
    setFilters(nextFilters);
    const magic = (nextFilters.magic || "").trim().toLowerCase();
    if (!magic || magic === "world") {
      setSelectionNotice("");
      setBrowseAllProbes(false);
      setListFilterActive(false);
      if (!mapSelectionLimitManuallyChangedRef.current && mapSelectionLimitBeforeRef.current !== null) {
        setLimit(mapSelectionLimitBeforeRef.current);
      }
      setMapSelectionActive(false);
      resetMapSelectionLimitTracking();
      return;
    }
    setSelectionNotice("");
  }, [filters, resetMapSelectionLimitTracking]);

  const removeMapAsn = useCallback((selection: ProbeMapAsnSelection) => {
    applyRemovedMagicFilters(selection.magic);
  }, [applyRemovedMagicFilters]);

  const removeProbe = useCallback((probe: GlobalpingProbe) => {
    const magic = (filters.magic || "").trim();
    const selected = !magic || magic.toLowerCase() === "world" ? [] : splitMagicList(magic);
    const matching = selected.filter((item) => probeMatchesFilters(probe, { magic: item }));
    applyRemovedMagicFilters(matching.length ? matching : probeToMagic(probe));
  }, [applyRemovedMagicFilters, filters.magic]);

  const isProbeSelected = useCallback(
    (probe: GlobalpingProbe) =>
      selectedProbeMagic.some((magic) => probeMatchesFilters(probe, { magic })),
    [selectedProbeMagic],
  );

  const boxSelect = useCallback((selected: GlobalpingProbe[]) => {
    if (!selected.length) {
      setSelectionNotice(messages.noBoxProbes);
      return;
    }
    const selection = magicFromSelectedProbes(selected, 10);
    if (!mapSelectionActive || mapSelectionLimitManuallyChangedRef.current || mapSelectionLimitBeforeRef.current === null) {
      mapSelectionLimitBeforeRef.current = limit;
    }
    mapSelectionLimitManuallyChangedRef.current = false;
    appendSelectionFilters(selection.magic);
    setLimit(Math.max(1, selection.selectedCount));
    setBrowseAllProbes(false);
    setMapSelectionActive(true);
    setSelectionNotice(
      selection.capped
        ? messages.addedBoxCapped(selected.length)
        : messages.addedBox(selection.selectedCount),
    );
  }, [appendSelectionFilters, limit, mapSelectionActive, messages]);

  const clearMapSelection = useCallback(() => {
    setFilters({ magic: "world" });
    setSelectionNotice("");
    setBrowseAllProbes(false);
    setListFilterActive(false);
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
    setBrowseAllProbes(false);
    setListFilterActive(false);
    setMapSelectionActive(false);
    resetMapSelectionLimitTracking();
    setMapFocusProbe(null);
    setMapFitToken((token) => token + 1);
  };

  const handleFiltersChange = useCallback((nextFilters: TraceFilters) => {
    setFilters(nextFilters);
    expandLimitForExplicitFilters(nextFilters);
    setSelectionNotice("");
    setBrowseAllProbes(false);
    setListFilterActive(false);
    setMapSelectionActive(false);
    resetMapSelectionLimitTracking();
  }, [expandLimitForExplicitFilters, resetMapSelectionLimitTracking]);

  const filterToProbe = useCallback((probe: GlobalpingProbe) => {
    const nextFilters: TraceFilters = {
      country: probe.location.country || undefined,
      city: probe.location.city || undefined,
      asn: normalizeAsn(probe.location.asn) || undefined,
      magic: "world",
    };
    setFilters(nextFilters);
    expandLimitForExplicitFilters(nextFilters);
    setSelectionNotice("");
    setBrowseAllProbes(false);
    setMapSelectionActive(false);
    resetMapSelectionLimitTracking();
    setListFilterActive(true);
    focusProbeOnMap(probe);
  }, [expandLimitForExplicitFilters, focusProbeOnMap, resetMapSelectionLimitTracking]);

  const clearListFilter = useCallback(() => {
    setFilters({ magic: "world" });
    setSelectionNotice("");
    setBrowseAllProbes(false);
    setListFilterActive(false);
    setMapSelectionActive(false);
    resetMapSelectionLimitTracking();
    setMapFocusProbe(null);
    setMapFitToken((token) => token + 1);
  }, [resetMapSelectionLimitTracking]);

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
          setMessage(userFacingErrorMessage(error, messages.measurementLoadFailed, messages));
        })
        .finally(() => setLoading(false));
    }
  }, [messages, nexttraceTokenDraft, nexttraceTokenRemembered, result]);

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

  const probeTable = (
    <ProbeTable
      probes={tableProbes}
      matchedCount={tableProbes.length}
      totalProbes={probes.length}
      status={probesStatus}
      filters={filters}
      filterSuggestions={filterSuggestions}
      selectionActive={mapSelectionActive}
      browseAll={browseAllProbes}
      listFilterActive={listFilterActive}
      isProbeSelected={isProbeSelected}
      onBrowseAllChange={setBrowseAllProbes}
      onClearListFilter={clearListFilter}
      onFiltersChange={handleFiltersChange}
      onPick={pickProbe}
      onFocus={focusProbeOnMap}
      onFilter={filterToProbe}
      onRemove={removeProbe}
    />
  );

  return (
    <I18nProvider locale={locale}>
      <BackgroundLayer backgroundImage={backgroundImage} />
      <main
        className={`app-shell${backgroundImage ? " ambient-photo-ready" : ""}${resultPriority ? " result-priority" : ""}${immersiveMap ? " map-immersive" : ""}${immersiveMap && probeDrawerOpen ? " probe-drawer-open" : ""}${resultSlideoverOpen ? " result-slideover-open" : ""}${finalResult ? " result-slideover-ready" : ""}`}
      >
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
          visibleProbes={mapSelectionActive ? addedProbes.length : filteredProbes.length}
          totalProbes={probes.length}
          probesStatus={probesStatus}
          quota={quota}
          selectionNotice={selectionNotice}
          mapSelectionActive={mapSelectionActive}
          loading={loading}
          canSubmit={canSubmit}
          globalpingTokenDraft={globalpingTokenDraft}
          globalpingTokenSaved={Boolean(globalpingToken)}
          globalpingTokenRemembered={globalpingTokenRemembered}
          nexttraceTokenDraft={nexttraceTokenDraft}
          nexttraceTokenSaved={Boolean(nexttraceToken)}
          nexttraceTokenRemembered={nexttraceTokenRemembered}
          themeMode={themeMode}
          locale={locale}
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
          onLocaleChange={updateLocale}
          onResultContentOrderChange={updateResultContentOrder}
          onNavigateHome={navigateHome}
          onNavigateAbout={navigateAbout}
          onReset={reset}
          onClearMapSelection={clearMapSelection}
          onSubmit={submit}
        />

        <div className="workspace">
          {message && (
            <Surface variant="flat" className="error-banner error-toast" role="alert">
              <AlertCircle size={18} />
              <span>{message}</span>
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
                    focusProbe={mapFocusProbe}
                    focusToken={mapFocusToken}
                    fitToken={mapFitToken}
                    onPickAsn={pickMapAsn}
                    onRemoveAsn={removeMapAsn}
                    onBoxSelect={boxSelect}
                  />
                </Suspense>
              ) : (
                <ProbeMapFallback />
              )}
              {immersiveMap ? null : probeTable}
            </div>
          </div>

          {immersiveMap && (
            <>
              {!probeDrawerOpen && (
                <button
                  type="button"
                  className="probe-drawer-toggle"
                  aria-expanded={false}
                  aria-controls={PROBE_DRAWER_ID}
                  onClick={() => setProbeDrawerOpen(true)}
                >
                  <List size={13} aria-hidden="true" />
                  <span className="probe-drawer-toggle-label">{messages.onlineProbes}</span>
                  <span className="probe-drawer-toggle-count" aria-hidden="true">
                    {mapSelectionActive ? addedProbes.length : filteredProbes.length}
                  </span>
                </button>
              )}
              <ProbeListDrawer
                id={PROBE_DRAWER_ID}
                open={probeDrawerOpen}
                title={messages.onlineProbes}
                onClose={() => setProbeDrawerOpen(false)}
              >
                {probeTable}
              </ProbeListDrawer>
            </>
          )}
        </div>
      </main>

      <Overlay
        open={route === "/about"}
        title={messages.aboutTitle}
        size="about"
        chrome="bare"
        placement="center"
        onClose={navigateHome}
      >
        <Suspense fallback={<AboutPageFallback />}>
          <AboutPage onBack={navigateHome} backgroundImage={backgroundImage} />
        </Suspense>
      </Overlay>

      <MeasurementLoadingDialog
        open={Boolean(measurementLoading)}
        measurementId={measurementLoading?.measurementId}
        onCancel={cancelMeasurementLoading}
      />

      {finalResult ? (
        <ResultSlideover
          open={resultSlideoverOpen}
          title={messages.resultsTitle}
          onOpen={showResult}
          onClose={closeResult}
        >
          <Suspense fallback={<ResultsViewFallback />}>
            <ResultsView
              result={finalResult}
              mapStyleUrl={config.mapStyleUrl}
              mapProjection={resultMapProjection}
              onMapProjectionChange={setResultMapProjection}
              onClose={closeResult}
            />
          </Suspense>
        </ResultSlideover>
      ) : null}

      <ResultContentOrderDialog
        open={resultContentOrderPromptOpen}
        onSelect={updateResultContentOrder}
      />
    </I18nProvider>
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
  const messages = useI18n();
  return (
    <Surface asChild className="about-panel">
      <section role="status" aria-live="polite" aria-label={messages.loadingAbout}>
        <div className="empty-hero">
          <Loader2 size={20} className="spin" />
          <div>
            <h2>{messages.loadingAbout}</h2>
          </div>
        </div>
      </section>
    </Surface>
  );
}

function ProbeMapFallback() {
  const messages = useI18n();
  return (
    <Surface asChild className="map-section" aria-label={messages.loadingProbeMap}>
      <section role="status" aria-live="polite">
        <div className="map-container map-loading-placeholder">
          <Loader2 size={22} className="spin" />
          <span>{messages.loadingMap}</span>
        </div>
      </section>
    </Surface>
  );
}

function ResultsViewFallback() {
  const messages = useI18n();
  return (
    <Surface asChild className="result-empty">
      <section role="status" aria-live="polite" aria-label={messages.loadingResults}>
        <div className="empty-hero">
          <Loader2 size={20} className="spin" />
          <div>
            <h2>{messages.loadingResults}</h2>
            <p>{messages.loadingResultsDescription}</p>
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
  const messages = useI18n();
  return (
    <Overlay
      open={open}
      title={messages.readingResults}
      size="compact"
      placement="center"
      closeOnBackdrop={false}
      onClose={onCancel}
    >
      <section className="measurement-loading" role="status" aria-live="polite" aria-label={messages.readingMeasurement}>
        <Loader2 size={24} className="spin" />
        <p>{messages.readingMeasurementDescription}</p>
        {measurementId && <span>{measurementId}</span>}
      </section>
    </Overlay>
  );
}

function ResultContentOrderDialog({
  open,
  onSelect,
}: {
  open: boolean;
  onSelect: (value: ResultContentOrder) => void;
}) {
  const messages = useI18n();
  return (
    <Overlay
      open={open}
      title={messages.resultOrderPrompt}
      size="compact"
      placement="center"
      dismissible={false}
      priority="blocking"
      className="result-layout-choice-panel"
      onClose={() => undefined}
    >
      <section className="result-layout-choice" aria-label={messages.resultOrderPrompt}>
        <p>{messages.resultOrderHint}</p>
        <div className="result-layout-choice-actions" aria-label={messages.resultOrderPrompt}>
          <Button variant="secondary" type="button" className="result-layout-choice-button" onClick={() => onSelect("map-first")}>
            <MapIcon size={16} aria-hidden="true" />
            {messages.mapFirst}
          </Button>
          <Button variant="secondary" type="button" className="result-layout-choice-button" onClick={() => onSelect("table-first")}>
            <Table2 size={16} aria-hidden="true" />
            {messages.tableFirst}
          </Button>
        </div>
      </section>
    </Overlay>
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
