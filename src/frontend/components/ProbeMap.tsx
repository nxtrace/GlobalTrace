import "./maplibre.css";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import { BoxSelect, MousePointer2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import { compactText, normalizeAsn } from "../../shared/filters";
import type { GlobalpingProbe } from "../../shared/types";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const PROBE_MAP_MAX_ZOOM = 5.2;
const PROBE_MAP_FIT_PADDING = { top: 68, right: 42, bottom: 42, left: 42 };
const PROBE_MAP_DESKTOP_FIT_PADDING = { top: 48, right: 24, bottom: 28, left: 24 };
const PROBE_MAP_DESKTOP_MIN_ZOOM = 1.15;
const PROBE_MAP_DESKTOP_MIN_WIDTH = 1181;
const PROBE_MAP_DESKTOP_MIN_HEIGHT = 900;
const PROBE_MAP_DESKTOP_MAX_HEIGHT = 1080;
const PROBE_MAP_DESKTOP_MIN_CANVAS_HEIGHT = 300;
const PROBE_MAP_DESKTOP_MAX_CANVAS_HEIGHT = 380;
const PROBE_MAP_FIT_DURATION_MS = 420;
const PROBE_PICKER_WIDTH = 286;
const PROBE_PICKER_MAX_HEIGHT = 360;

export interface ProbeMapAsnSelection {
  magic: string;
  city: string;
  country: string;
  asn: string;
  network: string;
  count: number;
}

interface ProbeMapProps {
  probes: GlobalpingProbe[];
  status: "loading" | "ready" | "error";
  selectionActive: boolean;
  mapStyleUrl: string;
  onPickAsn: (selection: ProbeMapAsnSelection) => void;
  onBoxSelect: (probes: GlobalpingProbe[]) => void;
  onClearSelection: () => void;
}

interface ProbePickerGroup extends ProbeMapAsnSelection {
  key: string;
}

interface ProbePickerState {
  city: string;
  country: string;
  total: number;
  groups: ProbePickerGroup[];
  left: number;
  top: number;
  pinned: boolean;
}

export function ProbeMap({
  probes,
  status,
  selectionActive,
  mapStyleUrl,
  onPickAsn,
  onBoxSelect,
  onClearSelection,
}: ProbeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const probesRef = useRef(probes);
  const [boxMode, setBoxMode] = useState(false);
  const [selectedProbeGroupKey, setSelectedProbeGroupKey] = useState<string | null>(null);
  const [picker, setPicker] = useState<ProbePickerState | null>(null);
  const pickerRef = useRef<ProbePickerState | null>(null);
  const onPickAsnRef = useRef(onPickAsn);
  const onBoxSelectRef = useRef(onBoxSelect);
  const selectedProbeGroupKeyRef = useRef<string | null>(null);

  probesRef.current = probes;
  pickerRef.current = picker;
  onPickAsnRef.current = onPickAsn;
  onBoxSelectRef.current = onBoxSelect;
  selectedProbeGroupKeyRef.current = selectedProbeGroupKey;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl,
      center: [8, 25],
      zoom: 1.2,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.setProjection({ type: "mercator" });
      map.addSource("probes", {
        type: "geojson",
        data: probeFeatureCollection(probesRef.current, selectedProbeGroupKeyRef.current),
      });
      map.addLayer({
        id: "probe-point-glow",
        type: "circle",
        source: "probes",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 10, 6, 17],
          "circle-color": ["case", ["==", ["get", "selected"], true], "#2dd4bf", "#93c5fd"],
          "circle-blur": 0.72,
          "circle-opacity": ["case", ["==", ["get", "selected"], true], 0.56, 0.32],
        },
      });
      map.addLayer({
        id: "probe-selected-halo",
        type: "circle",
        source: "probes",
        filter: ["==", ["get", "selected"], true],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 11, 6, 19],
          "circle-color": "rgba(45, 212, 191, 0.16)",
          "circle-stroke-color": "rgba(45, 212, 191, 0.72)",
          "circle-stroke-width": 2,
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
            ["case", ["==", ["get", "selected"], true], 5.4, 3.2],
            6,
            ["case", ["==", ["get", "selected"], true], 8.5, 5.5],
          ],
          "circle-color": ["case", ["==", ["get", "selected"], true], "#5eead4", "#bfdbfe"],
          "circle-stroke-color": ["case", ["==", ["get", "selected"], true], "#2dd4bf", "rgba(255, 255, 255, 0.86)"],
          "circle-stroke-width": ["case", ["==", ["get", "selected"], true], 1.8, 1],
          "circle-opacity": 0.92,
        },
      });
      fitVisibleProbes(map, probesRef.current);
    });
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
    requestAnimationFrame(() => {
      map.resize();
      fitVisibleProbes(map, probesRef.current);
    });
    mapRef.current = map;
    if (import.meta.env.DEV) {
      (containerRef.current as HTMLElement & { __globalTraceMap?: maplibregl.Map }).__globalTraceMap = map;
    }
    return () => {
      resizeObserver?.disconnect();
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
      setPicker(null);
    }
  }, [selectionActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("probes")) return;
    fitVisibleProbes(map, probes);
    setPicker(null);
  }, [probes]);

  const pickAsnGroup = (group: ProbePickerGroup) => {
    setSelectedProbeGroupKey(group.key);
    setPicker(null);
    onPickAsnRef.current({
      magic: group.magic,
      city: group.city,
      country: group.country,
      asn: group.asn,
      network: group.network,
      count: group.count,
    });
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boxMode) return;
    let start: { x: number; y: number } | null = null;
    const canvas = map.getCanvas();

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const point = pointerPoint(event, canvas);
      start = point;
      map.dragPan.disable();
      canvas.setPointerCapture?.(event.pointerId);
      if (boxRef.current) {
        boxRef.current.style.display = "block";
        boxRef.current.style.left = `${point.x}px`;
        boxRef.current.style.top = `${point.y}px`;
        boxRef.current.style.width = "0px";
        boxRef.current.style.height = "0px";
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!start || !boxRef.current) return;
      const current = pointerPoint(event, canvas);
      const minX = Math.min(start.x, current.x);
      const minY = Math.min(start.y, current.y);
      const maxX = Math.max(start.x, current.x);
      const maxY = Math.max(start.y, current.y);
      boxRef.current.style.left = `${minX}px`;
      boxRef.current.style.top = `${minY}px`;
      boxRef.current.style.width = `${maxX - minX}px`;
      boxRef.current.style.height = `${maxY - minY}px`;
    };

    const finishSelection = (event: PointerEvent) => {
      if (!start) return;
      const current = pointerPoint(event, canvas);
      const minX = Math.min(start.x, current.x);
      const minY = Math.min(start.y, current.y);
      const maxX = Math.max(start.x, current.x);
      const maxY = Math.max(start.y, current.y);
      const projected = validProbes(probesRef.current).map((probe) => ({
        city: probe.location.city,
        point: projectedProbePoint(map, probe, (minX + maxX) / 2),
      }));
      const selected = validProbes(probesRef.current).filter((probe) => {
        const point = projectedProbePoint(map, probe, (minX + maxX) / 2);
        return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
      });
      if (import.meta.env.DEV) {
        (canvas as HTMLCanvasElement & { __globalTraceLastBox?: unknown }).__globalTraceLastBox = {
          minX,
          minY,
          maxX,
          maxY,
          projected,
          selected: selected.map((probe) => probe.location.city),
        };
      }
      onBoxSelectRef.current(selected);
      start = null;
      map.dragPan.enable();
      if (boxRef.current) boxRef.current.style.display = "none";
      setBoxMode(false);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishSelection);
    window.addEventListener("pointercancel", finishSelection);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishSelection);
      window.removeEventListener("pointercancel", finishSelection);
      map.dragPan.enable();
      if (boxRef.current) boxRef.current.style.display = "none";
    };
  }, [boxMode]);

  return (
    <Surface asChild className="map-section" aria-label="probe map">
      <section>
        <div className="map-toolbar">
          <LiquidGlassSurface variant="toolbar" className="map-toolbar-surface">
            <LiquidGlassSurface
              variant="button"
              interactive
              className="map-tool-surface"
              onClick={() => setBoxMode((value) => !value)}
              actionRole="none"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={boxMode ? "primary" : "ghost"}
                    size="sm"
                    className={boxMode ? "tool-button active" : "tool-button"}
                    type="button"
                    title="框选 probes"
                    aria-pressed={boxMode}
                  >
                    {boxMode ? <MousePointer2 size={17} /> : <BoxSelect size={17} />}
                    {boxMode ? "拖拽选择" : "框选"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>拖拽地图区域生成 magic probe 筛选</TooltipContent>
              </Tooltip>
            </LiquidGlassSurface>
            {selectionActive && (
              <LiquidGlassSurface
                variant="button"
                interactive
                className="map-tool-surface"
                onClick={onClearSelection}
                actionRole="none"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="tool-button"
                      type="button"
                      title="取消地图筛选"
                      aria-label="取消地图筛选"
                    >
                      <X size={17} />
                      取消
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>清除地图点选或框选生成的 probe 筛选</TooltipContent>
                </Tooltip>
              </LiquidGlassSurface>
            )}
          </LiquidGlassSurface>
        </div>
        <div className="map-container" ref={containerRef} />
        {picker && (
          <div
            className={picker.pinned ? "probe-picker pinned" : "probe-picker"}
            style={{ left: picker.left, top: picker.top }}
            role="dialog"
            aria-label={`${locationTitle(picker)} probe candidates`}
          >
            <header className="probe-picker-header">
              <div>
                <strong>{locationTitle(picker)}</strong>
                {picker.country && <span>{picker.country}</span>}
              </div>
              <Badge variant="accent">+ {picker.total}</Badge>
              {picker.pinned && (
                <button
                  type="button"
                  className="probe-picker-close"
                  aria-label="关闭 probe 候选列表"
                  onClick={() => setPicker(null)}
                >
                  <X size={17} />
                </button>
              )}
            </header>
            <div className="probe-picker-list" role="listbox" aria-label="probe ASN candidates">
              {picker.groups.map((group) => (
                <button
                  type="button"
                  role="option"
                  aria-label={`${group.network} ${group.asn} ×${group.count}`}
                  aria-selected={selectedProbeGroupKey === group.key}
                  className="probe-picker-row"
                  key={group.key}
                  onClick={() => pickAsnGroup(group)}
                >
                  <span title={group.network}>{group.network}</span>
                  <small>
                    {group.asn} ×{group.count}
                  </small>
                </button>
              ))}
            </div>
          </div>
        )}
        {status === "ready" && probes.length === 0 && (
          <LiquidGlassSurface variant="panel" className="liquid-glass-coverage map-empty-surface">
            <div className="map-empty">
              <strong>没有匹配的在线 probe</strong>
              <span>放宽国家/地区、城市、ASN、network 或 tag 条件。</span>
            </div>
          </LiquidGlassSurface>
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

function fitVisibleProbes(map: maplibregl.Map, probes: GlobalpingProbe[]): void {
  const valid = validProbes(probes);
  if (valid.length === 0) return;
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

function pointerPoint(event: PointerEvent, element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  };
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

function locationTitle(location: Pick<ProbePickerState, "city" | "country">): string {
  return location.city || location.country || "Globalping";
}
