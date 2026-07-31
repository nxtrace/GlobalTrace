import "./maplibre.css";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import { BoxSelect, Hand } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import { compactText, normalizeAsn } from "../../shared/filters";
import { addMapAttribution } from "./mapAttribution";
import {
  applyMapPalette,
  applyProbeMarkerPalette,
  probeMarkerPaint,
  subscribeMapPaletteScheme,
} from "./mapPalette";
import type { GlobalpingProbe } from "../../shared/types";
import { ProbePicker } from "./probe-map/ProbePicker";
import { useProbeBoxSelection } from "./probe-map/useProbeBoxSelection";
import type { ProbeMapAsnSelection, ProbePickerGroup, ProbePickerState } from "./probe-map/types";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useI18n } from "../i18n";

const PROBE_MAP_DEFAULT_CENTER: [number, number] = [90, 36];
const PROBE_MAP_DEFAULT_ZOOM = 1.2;
const PROBE_MAP_INTRO_ZOOM = 0.95;
const PROBE_MAP_MAX_ZOOM = 5.2;
const PROBE_MAP_WORLD_SPAN_LON = 100;
const PROBE_MAP_WORLD_SPAN_LAT = 70;
const PROBE_MAP_FIT_PADDING = { top: 68, right: 42, bottom: 42, left: 42 };
const PROBE_MAP_DESKTOP_FIT_PADDING = { top: 48, right: 24, bottom: 28, left: 24 };
const PROBE_MAP_DESKTOP_MIN_ZOOM = 1.15;
const PROBE_MAP_DESKTOP_MIN_WIDTH = 1181;
const PROBE_MAP_DESKTOP_MIN_HEIGHT = 900;
const PROBE_MAP_DESKTOP_MAX_HEIGHT = 1080;
const PROBE_MAP_DESKTOP_MIN_CANVAS_HEIGHT = 300;
const PROBE_MAP_DESKTOP_MAX_CANVAS_HEIGHT = 380;
const PROBE_MAP_FIT_DURATION_MS = 420;
const PROBE_MAP_INTRO_DURATION_MS = 1100;
const PROBE_PICKER_WIDTH = 286;
const PROBE_PICKER_MAX_HEIGHT = 360;

export type { ProbeMapAsnSelection } from "./probe-map/types";

interface ProbeMapProps {
  probes: GlobalpingProbe[];
  status: "loading" | "ready" | "error";
  selectionActive: boolean;
  mapStyleUrl: string;
  focusProbe?: GlobalpingProbe | null;
  focusToken?: number;
  fitToken?: number;
  onPickAsn: (selection: ProbeMapAsnSelection) => void;
  onRemoveAsn: (selection: ProbeMapAsnSelection) => void;
  onBoxSelect: (probes: GlobalpingProbe[]) => void;
}

export function ProbeMap({
  probes,
  status,
  selectionActive,
  mapStyleUrl,
  focusProbe = null,
  focusToken = 0,
  fitToken = 0,
  onPickAsn,
  onRemoveAsn,
  onBoxSelect,
}: ProbeMapProps) {
  const messages = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const probesRef = useRef(probes);
  const focusProbeRef = useRef(focusProbe);
  const focusTokenRef = useRef(focusToken);
  const fitTokenRef = useRef(fitToken);
  const mapIntroPlayedRef = useRef(false);
  const [boxMode, setBoxMode] = useState(false);
  const [mapLoadError, setMapLoadError] = useState(false);
  const [selectedProbeGroupKey, setSelectedProbeGroupKey] = useState<string | null>(null);
  const [addedProbeGroupKeys, setAddedProbeGroupKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [picker, setPicker] = useState<ProbePickerState | null>(null);
  const pickerRef = useRef<ProbePickerState | null>(null);
  const onPickAsnRef = useRef(onPickAsn);
  const onRemoveAsnRef = useRef(onRemoveAsn);
  const onBoxSelectRef = useRef(onBoxSelect);
  const selectedProbeGroupKeyRef = useRef<string | null>(null);

  probesRef.current = probes;
  focusProbeRef.current = focusProbe;
  focusTokenRef.current = focusToken;
  fitTokenRef.current = fitToken;
  pickerRef.current = picker;
  onPickAsnRef.current = onPickAsn;
  onRemoveAsnRef.current = onRemoveAsn;
  onBoxSelectRef.current = onBoxSelect;
  selectedProbeGroupKeyRef.current = selectedProbeGroupKey;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    container.classList.remove("is-map-ready");
    let revealFrameId: number | null = null;
    let resizeFrameId: number | null = null;
    const map = new maplibregl.Map({
      container,
      style: mapStyleUrl,
      center: PROBE_MAP_DEFAULT_CENTER,
      zoom: PROBE_MAP_INTRO_ZOOM,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    addMapAttribution(map);
    mapIntroPlayedRef.current = false;
    const handleMapError = () => {
      if (mapIntroPlayedRef.current) return;
      container.classList.add("is-map-ready");
      setMapLoadError(true);
    };
    const handleMapLoad = () => {
      container.classList.remove("is-map-ready");
      setMapLoadError(false);
      applyMapPalette(map);
      map.setProjection({ type: "mercator" });
      map.addSource("probes", {
        type: "geojson",
        data: probeFeatureCollection(probesRef.current, selectedProbeGroupKeyRef.current),
      });
      const markerPaint = probeMarkerPaint();
      map.addLayer({
        id: "probe-point-glow",
        type: "circle",
        source: "probes",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 10, 6, 17],
          "circle-blur": 0.72,
          ...markerPaint.glow,
        },
      });
      map.addLayer({
        id: "probe-selected-halo",
        type: "circle",
        source: "probes",
        filter: ["==", ["get", "selected"], true],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 8, 6, 14],
          "circle-stroke-width": 1.25,
          ...markerPaint.halo,
        },
      });
      map.addLayer({
        id: "probe-points",
        type: "circle",
        source: "probes",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            1,
            ["case", ["==", ["get", "selected"], true], 4.4, 3.2],
            6,
            ["case", ["==", ["get", "selected"], true], 7, 5.5],
          ],
          "circle-stroke-width": ["case", ["==", ["get", "selected"], true], 1.4, 1],
          "circle-opacity": 0.92,
          ...markerPaint.point,
        },
      });
      map.resize();
      const pendingFocus = focusProbeRef.current;
      const focusCoordinates = pendingFocus
        ? [pendingFocus.location.longitude, pendingFocus.location.latitude] as [number, number]
        : null;
      if (
        pendingFocus &&
        focusTokenRef.current > 0 &&
        focusCoordinates &&
        focusCoordinates.every(Number.isFinite)
      ) {
        setSelectedProbeGroupKey(probeSelectionKey(pendingFocus));
        setPicker(null);
        map.easeTo({
          center: focusCoordinates,
          zoom: PROBE_MAP_MAX_ZOOM,
          duration: PROBE_MAP_FIT_DURATION_MS,
          essential: true,
        });
      } else if (fitTokenRef.current > 0) {
        setSelectedProbeGroupKey(null);
        setPicker(null);
        fitVisibleProbes(map, probesRef.current);
      } else {
        fitVisibleProbes(map, probesRef.current, { playIntro: true });
      }
      mapIntroPlayedRef.current = true;
      // Reveal after palette + first camera settle to avoid Liberty default-color flash.
      revealFrameId = window.requestAnimationFrame(() => {
        revealFrameId = null;
        container.classList.add("is-map-ready");
      });
    };
    map.on("error", handleMapError);
    map.on("load", handleMapLoad);
    const openProbePicker = (event: maplibregl.MapMouseEvent, pinned: boolean) => {
      if (!pinned && pickerRef.current?.pinned) return;
      const nextPicker = pickerForEvent(map, event, probesRef.current, pinned);
      if (!nextPicker) return;
      map.getCanvas().style.cursor = "pointer";
      setPicker(nextPicker);
    };
    const pinProbePicker = (event: maplibregl.MapMouseEvent) => {
      openProbePicker(event, true);
    };
    const previewProbePicker = (event: maplibregl.MapMouseEvent) => {
      openProbePicker(event, false);
    };
    const hideProbePicker = () => {
      map.getCanvas().style.cursor = "";
      if (!pickerRef.current?.pinned) setPicker(null);
    };
    map.on("click", "probe-points", pinProbePicker);
    map.on("mouseenter", "probe-points", previewProbePicker);
    map.on("mousemove", "probe-points", previewProbePicker);
    map.on("mouseleave", "probe-points", hideProbePicker);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => map.resize());
    resizeObserver?.observe(containerRef.current);
    resizeFrameId = window.requestAnimationFrame(() => {
      resizeFrameId = null;
      map.resize();
    });
    mapRef.current = map;
    const unsubscribePalette = subscribeMapPaletteScheme((scheme) => {
      applyMapPalette(map, scheme);
      applyProbeMarkerPalette(map, scheme);
    });
    if (import.meta.env.DEV) {
      (containerRef.current as HTMLElement & { __globalTraceMap?: maplibregl.Map }).__globalTraceMap = map;
    }
    return () => {
      unsubscribePalette();
      resizeObserver?.disconnect();
      if (revealFrameId !== null) window.cancelAnimationFrame(revealFrameId);
      if (resizeFrameId !== null) window.cancelAnimationFrame(resizeFrameId);
      map.off("error", handleMapError);
      map.off("load", handleMapLoad);
      map.off("click", "probe-points", pinProbePicker);
      map.off("mouseenter", "probe-points", previewProbePicker);
      map.off("mousemove", "probe-points", previewProbePicker);
      map.off("mouseleave", "probe-points", hideProbePicker);
      if (containerRef.current) {
        delete (containerRef.current as HTMLElement & { __globalTraceMap?: maplibregl.Map }).__globalTraceMap;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [mapStyleUrl]);

  useEffect(() => {
    const source = mapRef.current?.getSource("probes") as GeoJSONSource | undefined;
    source?.setData(probeFeatureCollection(probes, selectedProbeGroupKey));
  }, [probes, selectedProbeGroupKey]);

  useEffect(() => {
    if (!selectionActive) {
      setSelectedProbeGroupKey(null);
      setAddedProbeGroupKeys(new Set());
      setPicker(null);
    }
  }, [selectionActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("probes") || !mapIntroPlayedRef.current) return;
    fitVisibleProbes(map, probes);
    setPicker(null);
  }, [probes]);

  useEffect(() => {
    if (!focusProbe || focusToken < 1) return;
    const map = mapRef.current;
    if (!map?.getSource("probes")) return;
    const { longitude, latitude } = focusProbe.location;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
    setSelectedProbeGroupKey(probeSelectionKey(focusProbe));
    setPicker(null);
    map.easeTo({
      center: [longitude, latitude],
      zoom: PROBE_MAP_MAX_ZOOM,
      duration: PROBE_MAP_FIT_DURATION_MS,
      essential: true,
    });
  }, [focusProbe, focusToken]);

  useEffect(() => {
    if (fitToken < 1) return;
    const map = mapRef.current;
    if (!map?.getSource("probes") || !mapIntroPlayedRef.current) return;
    setSelectedProbeGroupKey(null);
    setPicker(null);
    fitVisibleProbes(map, probesRef.current);
  }, [fitToken]);

  const pickAsnGroup = (group: ProbePickerGroup) => {
    setSelectedProbeGroupKey(group.key);
    setAddedProbeGroupKeys((prev) => {
      if (prev.has(group.key)) return prev;
      const next = new Set(prev);
      next.add(group.key);
      return next;
    });
    onPickAsnRef.current({
      magic: group.magic,
      city: group.city,
      country: group.country,
      asn: group.asn,
      network: group.network,
      count: group.count,
    });
  };

  const removeAsnGroup = (group: ProbePickerGroup) => {
    setAddedProbeGroupKeys((prev) => {
      if (!prev.has(group.key)) return prev;
      const next = new Set(prev);
      next.delete(group.key);
      return next;
    });
    setSelectedProbeGroupKey((current) => (current === group.key ? null : current));
    onRemoveAsnRef.current({
      magic: group.magic,
      city: group.city,
      country: group.country,
      asn: group.asn,
      network: group.network,
      count: group.count,
    });
  };

  useProbeBoxSelection({
    boxMode,
    boxRef,
    mapRef,
    onBoxSelectRef,
    probesRef,
    setBoxMode,
  });

  return (
    <Surface asChild className="map-section" aria-label={messages.probeMap}>
      <section>
        <div className="map-toolbar">
          <div className="map-mode-switch" role="group" aria-label={messages.mapInteractionMode}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`map-mode-button${!boxMode ? " is-active" : ""}`}
                  type="button"
                  title={messages.mapPanHint}
                  aria-pressed={!boxMode}
                  aria-label={messages.dragSelect}
                  onClick={() => setBoxMode(false)}
                >
                  <Hand size={16} />
                  {messages.dragSelect}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{messages.mapPanHint}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`map-mode-button${boxMode ? " is-active" : ""}`}
                  type="button"
                  title={messages.boxSelectProbes}
                  aria-pressed={boxMode}
                  aria-label={messages.boxSelect}
                  onClick={() => setBoxMode(true)}
                >
                  <BoxSelect size={16} />
                  {messages.boxSelect}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{messages.dragSelectHint}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="map-container" ref={containerRef} />
        {mapLoadError && (
          <div className="map-load-error" role="alert">
            {messages.mapLoadError}
          </div>
        )}
        {picker && (
          <ProbePicker
            picker={picker}
            selectedProbeGroupKey={selectedProbeGroupKey}
            addedProbeGroupKeys={addedProbeGroupKeys}
            onClose={() => setPicker(null)}
            onPickGroup={pickAsnGroup}
            onRemoveGroup={removeAsnGroup}
          />
        )}
        {status === "ready" && probes.length === 0 && (
          <div className="map-empty">
            <strong>{messages.noMatchingProbes}</strong>
            <span>{messages.relaxProbeFilters}</span>
          </div>
        )}
        <div className="selection-box" ref={boxRef} />
      </section>
    </Surface>
  );
}

interface ProbeFeatureProperties {
  index: number;
  key: string;
  tags: string[];
  city: string;
  country: string;
  asn: number;
  network: string;
  selected: boolean;
}

function probeFeatureCollection(
  probes: GlobalpingProbe[],
  selectedKey: string | null,
): FeatureCollection<Point, ProbeFeatureProperties> {
  return {
    type: "FeatureCollection",
    features: validProbes(probes)
      .map((probe, index) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [probe.location.longitude, probe.location.latitude],
        },
        properties: {
          index,
          key: probeKey(probe),
          tags: probe.tags,
          city: probe.location.city,
          country: probe.location.country,
          asn: probe.location.asn,
          network: probe.location.network,
          selected: probeSelectionKey(probe) === selectedKey,
        },
      })),
  };
}

function validProbes(probes: GlobalpingProbe[]): GlobalpingProbe[] {
  return probes.filter((probe) => Number.isFinite(probe.location.longitude) && Number.isFinite(probe.location.latitude));
}

function fitVisibleProbes(
  map: maplibregl.Map,
  probes: GlobalpingProbe[],
  options: { playIntro?: boolean } = {},
): void {
  const valid = validProbes(probes);
  if (valid.length === 0) {
    easeToDefaultProbeView(map, options.playIntro);
    return;
  }
  if (valid.length === 1) {
    const probe = valid[0];
    map.easeTo({
      center: [probe.location.longitude, probe.location.latitude],
      zoom: PROBE_MAP_MAX_ZOOM,
      duration: PROBE_MAP_FIT_DURATION_MS,
      essential: true,
    });
    return;
  }
  const bounds = probeBounds(valid);
  if (!bounds) return;
  // Worldwide probe sets would recenter away from the curated default view.
  if (isWorldwideProbeBounds(bounds)) {
    easeToDefaultProbeView(map, options.playIntro);
    return;
  }
  if (shouldUseDesktopOverviewZoom(map)) {
    const camera = map.cameraForBounds(bounds, {
      padding: PROBE_MAP_DESKTOP_FIT_PADDING,
      maxZoom: PROBE_MAP_MAX_ZOOM,
    });
    if (typeof camera?.zoom === "number") {
      map.easeTo({
        ...camera,
        zoom: Math.max(camera.zoom, PROBE_MAP_DESKTOP_MIN_ZOOM),
        duration: PROBE_MAP_FIT_DURATION_MS,
        essential: true,
      });
      return;
    }
  }
  map.fitBounds(bounds, {
    padding: PROBE_MAP_FIT_PADDING,
    maxZoom: PROBE_MAP_MAX_ZOOM,
    duration: PROBE_MAP_FIT_DURATION_MS,
    essential: true,
  });
}

function isWorldwideProbeBounds(bounds: [[number, number], [number, number]]): boolean {
  const [[west, south], [east, north]] = bounds;
  return east - west >= PROBE_MAP_WORLD_SPAN_LON || north - south >= PROBE_MAP_WORLD_SPAN_LAT;
}

function easeToDefaultProbeView(map: maplibregl.Map, playIntro = false): void {
  map.easeTo({
    center: PROBE_MAP_DEFAULT_CENTER,
    zoom: PROBE_MAP_DEFAULT_ZOOM,
    duration: playIntro ? PROBE_MAP_INTRO_DURATION_MS : PROBE_MAP_FIT_DURATION_MS,
    essential: true,
  });
}

function shouldUseDesktopOverviewZoom(map: maplibregl.Map): boolean {
  const canvasHeight = map.getCanvas().getBoundingClientRect().height;
  return (
    window.innerWidth >= PROBE_MAP_DESKTOP_MIN_WIDTH &&
    window.innerHeight >= PROBE_MAP_DESKTOP_MIN_HEIGHT &&
    window.innerHeight <= PROBE_MAP_DESKTOP_MAX_HEIGHT &&
    canvasHeight >= PROBE_MAP_DESKTOP_MIN_CANVAS_HEIGHT &&
    canvasHeight <= PROBE_MAP_DESKTOP_MAX_CANVAS_HEIGHT
  );
}

function probeBounds(probes: GlobalpingProbe[]): [[number, number], [number, number]] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const probe of probes) {
    west = Math.min(west, probe.location.longitude);
    south = Math.min(south, probe.location.latitude);
    east = Math.max(east, probe.location.longitude);
    north = Math.max(north, probe.location.latitude);
  }
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (west === east && south === north) return null;
  return [
    [west, south],
    [east, north],
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function projectedProbePoint(
  map: maplibregl.Map,
  probe: GlobalpingProbe,
  targetX: number,
): { x: number; y: number } {
  const { longitude, latitude } = probe.location;
  return [longitude - 360, longitude, longitude + 360]
    .map((lng) => map.project([lng, latitude]))
    .sort((a, b) => Math.abs(a.x - targetX) - Math.abs(b.x - targetX))[0];
}

function probeKey(probe: GlobalpingProbe): string {
  const { city, country } = probe.location;
  return [compactText(city), compactText(country)].join("|");
}

function probeSelectionKey(probe: GlobalpingProbe): string {
  return [probeKey(probe), normalizeAsn(probe.location.asn)].join("|");
}

function probeAtFeatureIndex(probes: GlobalpingProbe[], index: number): GlobalpingProbe | null {
  return validProbes(probes)[index] ?? null;
}

function pickerForEvent(
  map: maplibregl.Map,
  event: maplibregl.MapMouseEvent,
  probes: GlobalpingProbe[],
  pinned: boolean,
): ProbePickerState | null {
  const index = Number(map.queryRenderedFeatures(event.point, { layers: ["probe-points"] })[0]?.properties?.index);
  if (!Number.isFinite(index)) return null;
  const probe = probeAtFeatureIndex(probes, index);
  if (!probe) return null;
  const groups = probePickerGroups(probe, validProbes(probes));
  if (!groups.length) return null;
  const anchor = projectedProbePoint(map, probe, event.point.x);
  const position = probePickerPosition(map, anchor);
  return {
    city: compactText(probe.location.city),
    country: compactText(probe.location.country),
    total: groups.reduce((sum, group) => sum + group.count, 0),
    groups,
    left: position.left,
    top: position.top,
    pinned,
  };
}

function probePickerGroups(anchor: GlobalpingProbe, probes: GlobalpingProbe[]): ProbePickerGroup[] {
  const anchorKey = probeKey(anchor);
  const groups = new Map<string, ProbePickerGroup>();
  for (const probe of probes) {
    if (probeKey(probe) !== anchorKey) continue;
    const asn = normalizeAsn(probe.location.asn);
    if (!asn) continue;
    const key = [anchorKey, asn].join("|");
    const network = compactText(probe.location.network) || "Unknown network";
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.network === "Unknown network" && network !== "Unknown network") {
        existing.network = network;
      }
      continue;
    }
    const city = compactText(probe.location.city);
    const country = compactText(probe.location.country);
    groups.set(key, {
      key,
      city,
      country,
      asn,
      network,
      count: 1,
      magic: [city, country, asn].filter(Boolean).join("+") || "world",
    });
  }
  return Array.from(groups.values()).sort(
    (left, right) =>
      right.count - left.count ||
      left.network.localeCompare(right.network) ||
      left.asn.localeCompare(right.asn),
  );
}

function probePickerPosition(map: maplibregl.Map, anchor: { x: number; y: number }): { left: number; top: number } {
  const rect = map.getCanvas().getBoundingClientRect();
  const maxLeft = Math.max(10, rect.width - PROBE_PICKER_WIDTH - 10);
  const maxTop = Math.max(10, rect.height - PROBE_PICKER_MAX_HEIGHT - 10);
  return {
    left: Math.round(clamp(anchor.x + 18, 10, maxLeft)),
    top: Math.round(clamp(anchor.y - 26, 10, maxTop)),
  };
}
