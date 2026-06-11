import "./maplibre.css";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import { BoxSelect, MousePointer2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import type { GlobalpingProbe } from "../../shared/types";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface ProbeMapProps {
  probes: GlobalpingProbe[];
  totalProbes: number;
  status: "loading" | "ready" | "error";
  selectionNotice: string;
  selectionActive: boolean;
  mapStyleUrl: string;
  onPickProbe: (probe: GlobalpingProbe) => void;
  onBoxSelect: (probes: GlobalpingProbe[]) => void;
  onClearSelection: () => void;
}

export function ProbeMap({
  probes,
  totalProbes,
  status,
  selectionNotice,
  selectionActive,
  mapStyleUrl,
  onPickProbe,
  onBoxSelect,
  onClearSelection,
}: ProbeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const probesRef = useRef(probes);
  const [boxMode, setBoxMode] = useState(false);
  const [selectedProbeKey, setSelectedProbeKey] = useState<string | null>(null);
  const onPickProbeRef = useRef(onPickProbe);
  const onBoxSelectRef = useRef(onBoxSelect);
  const selectedProbeKeyRef = useRef<string | null>(null);

  probesRef.current = probes;
  onPickProbeRef.current = onPickProbe;
  onBoxSelectRef.current = onBoxSelect;
  selectedProbeKeyRef.current = selectedProbeKey;

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
      map.addSource("probes", {
        type: "geojson",
        data: probeFeatureCollection(probesRef.current, selectedProbeKeyRef.current),
        cluster: true,
        clusterMaxZoom: 8,
        clusterRadius: 46,
      });
      map.addLayer({
        id: "probe-clusters",
        type: "circle",
        source: "probes",
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["step", ["get", "point_count"], 17, 20, 22, 100, 28, 1000, 34],
          "circle-color": ["step", ["get", "point_count"], "#8aa6a0", 20, "#71948d", 100, "#587f78"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.6,
          "circle-opacity": 0.86,
        },
      });
      map.addLayer({
        id: "probe-selected-halo",
        type: "circle",
        source: "probes",
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "selected"], true]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 12, 6, 18],
          "circle-color": "rgba(79, 129, 121, 0.18)",
          "circle-stroke-color": "rgba(79, 129, 121, 0.34)",
          "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: "probe-points",
        type: "circle",
        source: "probes",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            1,
            ["case", ["==", ["get", "selected"], true], 7, 4],
            6,
            ["case", ["==", ["get", "selected"], true], 11, 7],
          ],
          "circle-color": ["case", ["in", "eyeball-network", ["get", "tags"]], "#4f8179", "#a48e65"],
          "circle-stroke-color": ["case", ["==", ["get", "selected"], true], "#1f3f3a", "#ffffff"],
          "circle-stroke-width": ["case", ["==", ["get", "selected"], true], 2.5, 1.2],
          "circle-opacity": 0.9,
        },
      });
      fitVisibleProbes(map, probesRef.current);
    });
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "probe-map-popup",
      offset: 12,
    });
    const pickProbeAtPoint = (event: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, { layers: ["probe-points"] });
      const index = Number(features[0]?.properties?.index);
      const probe = probesRef.current[index];
      if (!probe) return;
      setSelectedProbeKey(probeKey(probe));
      popup.setLngLat([probe.location.longitude, probe.location.latitude]).setDOMContent(probePopupNode(probe)).addTo(map);
      onPickProbeRef.current(probe);
    };
    const showProbePopup = (event: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, { layers: ["probe-points"] });
      const index = Number(features[0]?.properties?.index);
      const probe = probesRef.current[index];
      if (!probe) return;
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat([probe.location.longitude, probe.location.latitude]).setDOMContent(probePopupNode(probe)).addTo(map);
    };
    const hideProbePopup = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };
    const zoomCluster = async (event: maplibregl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ["probe-clusters"] })[0];
      const clusterId = Number(feature?.properties?.cluster_id);
      const coordinates = pointCoordinates(feature?.geometry);
      if (!Number.isFinite(clusterId) || !coordinates) return;
      const source = map.getSource("probes") as GeoJSONSource | undefined;
      const expansionZoom = await source?.getClusterExpansionZoom(clusterId);
      map.easeTo({
        center: coordinates,
        zoom: Math.min(expansionZoom ?? map.getZoom() + 2, 9),
        duration: 420,
        essential: true,
      });
    };
    const setClusterCursor = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearClusterCursor = () => {
      map.getCanvas().style.cursor = "";
    };
    map.on("click", "probe-points", pickProbeAtPoint);
    map.on("mouseenter", "probe-points", showProbePopup);
    map.on("mousemove", "probe-points", showProbePopup);
    map.on("mouseleave", "probe-points", hideProbePopup);
    map.on("click", "probe-clusters", zoomCluster);
    map.on("mouseenter", "probe-clusters", setClusterCursor);
    map.on("mouseleave", "probe-clusters", clearClusterCursor);
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
      popup.remove();
      map.off("click", "probe-points", pickProbeAtPoint);
      map.off("mouseenter", "probe-points", showProbePopup);
      map.off("mousemove", "probe-points", showProbePopup);
      map.off("mouseleave", "probe-points", hideProbePopup);
      map.off("click", "probe-clusters", zoomCluster);
      map.off("mouseenter", "probe-clusters", setClusterCursor);
      map.off("mouseleave", "probe-clusters", clearClusterCursor);
      if (containerRef.current) {
        delete (containerRef.current as HTMLElement & { __globalTraceMap?: maplibregl.Map }).__globalTraceMap;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [mapStyleUrl]);

  useEffect(() => {
    const source = mapRef.current?.getSource("probes") as GeoJSONSource | undefined;
    source?.setData(probeFeatureCollection(probes, selectedProbeKey));
  }, [probes, selectedProbeKey]);

  useEffect(() => {
    if (!selectionActive) setSelectedProbeKey(null);
  }, [selectionActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("probes")) return;
    fitVisibleProbes(map, probes);
  }, [probes]);

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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={boxMode ? "primary" : "ghost"}
                size="sm"
            className={boxMode ? "tool-button active" : "tool-button"}
            type="button"
            onClick={() => setBoxMode((value) => !value)}
            title="框选 probes"
            aria-pressed={boxMode}
          >
            {boxMode ? <MousePointer2 size={17} /> : <BoxSelect size={17} />}
            {boxMode ? "拖拽选择" : "框选"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>拖拽地图区域生成 magic probe 筛选</TooltipContent>
          </Tooltip>
          {selectionActive && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="tool-button"
                  type="button"
                  onClick={onClearSelection}
                  title="取消地图筛选"
                  aria-label="取消地图筛选"
                >
                  <X size={17} />
                  取消
                </Button>
              </TooltipTrigger>
              <TooltipContent>清除地图点选或框选生成的 probe 筛选</TooltipContent>
            </Tooltip>
          )}
        </LiquidGlassSurface>
      </div>
      <div className="map-container" ref={containerRef} />
      <div className="map-status" aria-live="polite">
        <div>
          <strong>{mapStatusText(status, probes.length, totalProbes)}</strong>
          <span>{selectionNotice || "点选地图表示选择筛选条件，不承诺指定精确 probe"}</span>
        </div>
        <div className="map-legend" aria-label="probe 类型图例">
          <Badge variant="accent"><i className="legend-dot eyeball" /> eyeball</Badge>
          <Badge variant="warn"><i className="legend-dot datacenter" /> datacenter</Badge>
        </div>
      </div>
      {status === "ready" && probes.length === 0 && (
        <div className="map-empty">
          <strong>没有匹配的在线 probe</strong>
          <span>放宽国家/地区、城市、ASN、network 或 tag 条件。</span>
        </div>
      )}
      <div className="selection-box" ref={boxRef} />
      </section>
    </Surface>
  );
}

function mapStatusText(status: "loading" | "ready" | "error", visible: number, total: number): string {
  if (status === "loading") return "probes 加载中";
  if (status === "error") return "probes 读取失败";
  return `${visible} / ${total} probes`;
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
          selected: probeKey(probe) === selectedKey,
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
      zoom: 5.2,
      duration: 420,
      essential: true,
    });
    return;
  }
  const bounds = probeBounds(valid);
  if (!bounds) return;
  map.fitBounds(bounds, {
    padding: { top: 68, right: 42, bottom: 42, left: 42 },
    maxZoom: 5.2,
    duration: 420,
    essential: true,
  });
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

function pointCoordinates(geometry: unknown): [number, number] | null {
  if (!geometry || typeof geometry !== "object" || (geometry as { type?: unknown }).type !== "Point") return null;
  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  return Array.isArray(coordinates) && coordinates.length >= 2
    ? [Number(coordinates[0]), Number(coordinates[1])]
    : null;
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
  const { latitude, longitude, city, country, asn, network } = probe.location;
  return [latitude, longitude, city, country, asn, network].join("|");
}

function probePopupNode(probe: GlobalpingProbe): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "probe-popup";
  const title = document.createElement("strong");
  title.textContent = [probe.location.city, probe.location.country].filter(Boolean).join(", ") || "Globalping probe";
  const meta = document.createElement("span");
  meta.textContent = [`AS${probe.location.asn}`, probe.location.network].filter(Boolean).join(" · ");
  const tags = document.createElement("small");
  tags.textContent = probe.tags.slice(0, 3).join(" · ");
  wrapper.append(title, meta, tags);
  return wrapper;
}
