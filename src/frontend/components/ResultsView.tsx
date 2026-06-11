import "./maplibre.css";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import { AlertTriangle, Clock3, Copy, Globe2, Map as MapIcon, Route, Server, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Feature, FeatureCollection } from "geojson";
import type { TraceHop, TraceProbeResult, TraceResultResponse } from "../../shared/types";
import {
  buildRouteNodeIdByTtl,
  buildRouteNodesForHops,
  nearestWorldCoordinate,
  validMapCoordinate,
  type ResultRouteCoordinate,
  type ResultRouteNode as SharedResultRouteNode,
} from "../lib/resultRouteNodes";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import type { MapProjection } from "./mapProjection";

const RESULT_MAP_DEFAULT_CENTER: [number, number] = [8, 25];
const RESULT_MAP_DEFAULT_ZOOM = 1.4;
const RESULT_MAP_SINGLE_POINT_ZOOM = 5;
const RESULT_MAP_MAX_ZOOM = 5.8;

type ResultMapCoordinate = ResultRouteCoordinate;

interface ResultMapData {
  featureCollection: FeatureCollection;
  fitCoordinates: ResultMapCoordinate[];
  routeNodes: ResultRouteNode[];
  routeNodeById: Map<string, ResultRouteNode>;
  routeNodeIdByTtl: Map<number, string>;
}

interface ResultRouteNode extends SharedResultRouteNode {
  popupTitle: string;
  popupBody: string;
}

interface ResultMapDebugElement extends HTMLElement {
  __globalTraceResultMap?: maplibregl.Map;
  __globalTraceResultData?: ResultMapData;
  __globalTraceSelectedRouteNodeId?: string | null;
}

interface ResultsViewProps {
  result: TraceResultResponse | null;
  mapStyleUrl: string;
  mapProjection?: MapProjection;
  onMapProjectionChange?: (value: MapProjection) => void;
  renderMap?: boolean;
  onClose?: () => void;
}

export function ResultsView({
  result,
  mapStyleUrl,
  mapProjection = "mercator",
  onMapProjectionChange,
  renderMap = true,
  onClose,
}: ResultsViewProps) {
  const [selected, setSelected] = useState(0);
  const [selectedRouteNodeId, setSelectedRouteNodeId] = useState<string | null>(null);
  const [mapFocusRequest, setMapFocusRequest] = useState(0);
  const active = result?.results[selected] || result?.results[0] || null;
  const mapData = useMemo(() => buildResultMapData(active, result?.results || []), [active, result?.results]);

  useEffect(() => {
    setSelected(0);
  }, [result?.measurementId]);

  useEffect(() => {
    setSelectedRouteNodeId(null);
  }, [active?.id, result?.measurementId]);

  const selectRouteNode = (nodeId: string | null, focusMap = false) => {
    setSelectedRouteNodeId(nodeId);
    if (focusMap && nodeId) setMapFocusRequest((value) => value + 1);
  };

  const selectHop = (ttl: number) => {
    selectRouteNode(mapData.routeNodeIdByTtl.get(ttl) || null, true);
  };

  if (!result) {
    return (
      <Surface asChild className="result-empty">
        <section>
        <div className="empty-hero">
          <Route size={20} />
          <div>
            <h2>等待网络路径诊断</h2>
            <p>创建 measurement 后，这里显示 probe、route summary、hop 明细和原始输出。</p>
          </div>
        </div>
        </section>
      </Surface>
    );
  }

  const summary = resultSummary(result, active);

  return (
    <Surface asChild className="results-section">
      <section>
      <div className="section-header">
        <div>
          <h2>{result.target}</h2>
          <p>
            {result.status} · {result.probesCount} probes · {result.measurementId}
          </p>
        </div>
        <div className="result-header-actions">
          {renderMap && <ResultMapToolbar mapProjection={mapProjection} onMapProjectionChange={onMapProjectionChange} />}
          <ShareButton measurementId={result.measurementId} />
          {onClose && (
            <Button variant="glass" size="sm" type="button" onClick={onClose} title="关闭结果" aria-label="关闭结果">
              <X size={16} />
              关闭结果
            </Button>
          )}
        </div>
      </div>

      <div className="result-metrics" aria-label="trace summary">
        {summary.map((metric) => (
          <div className="metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>

      <Tabs value={String(selected)} onValueChange={(value) => setSelected(Number(value))}>
        <TabsList className="probe-tabs" aria-label="probe results">
          {result.results.map((item, index) => (
            <TabsTrigger key={item.id} value={String(index)} onClick={() => setSelected(index)}>
              <strong>{item.probe.city || item.probe.country}</strong>
              <span>AS{item.probe.asn} · {item.status}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={String(selected)} className="probe-tab-content">
          {renderMap && (
            <ResultMap
              data={mapData}
              mapStyleUrl={mapStyleUrl}
              mapProjection={mapProjection}
              selectedRouteNodeId={selectedRouteNodeId}
              mapFocusRequest={mapFocusRequest}
              onSelectRouteNode={(nodeId) => selectRouteNode(nodeId)}
            />
          )}

          <EnrichmentStrip result={result} />

          {result.status === "in-progress" && (
            <Surface variant="flat" className="polling-state">
              <Clock3 size={16} />
              measurement 正在运行，轮询完成后会补齐 hop 和 GeoIP。
            </Surface>
          )}

          {active ? (
            <HopTable
              active={active}
              mapData={mapData}
              selectedRouteNodeId={selectedRouteNodeId}
              onSelectHop={selectHop}
            />
          ) : (
            <p className="muted">暂无 probe result。</p>
          )}
        </TabsContent>
      </Tabs>
      </section>
    </Surface>
  );
}

function ResultMapToolbar({
  mapProjection,
  onMapProjectionChange,
}: {
  mapProjection: MapProjection;
  onMapProjectionChange?: (value: MapProjection) => void;
}) {
  return (
    <div className="result-map-toolbar" role="group" aria-label="结果地图视图">
      <LiquidGlassSurface variant="toolbar" className="result-map-toolbar-surface">
        <div className="result-map-view-switch">
          <Button
            variant={mapProjection === "mercator" ? "primary" : "ghost"}
            size="sm"
            type="button"
            onClick={() => onMapProjectionChange?.("mercator")}
            aria-pressed={mapProjection === "mercator"}
            aria-label="切换结果地图到 2D"
            disabled={!onMapProjectionChange && mapProjection !== "mercator"}
          >
            <MapIcon size={16} />
            2D
          </Button>
          <Button
            variant={mapProjection === "globe" ? "primary" : "ghost"}
            size="sm"
            type="button"
            onClick={() => onMapProjectionChange?.("globe")}
            aria-pressed={mapProjection === "globe"}
            aria-label="切换结果地图到 3D"
            disabled={!onMapProjectionChange && mapProjection !== "globe"}
          >
            <Globe2 size={16} />
            3D
          </Button>
        </div>
      </LiquidGlassSurface>
    </div>
  );
}

function ShareButton({ measurementId }: { measurementId: string }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("measurement", measurementId);
    return url.toString();
  }, [measurementId]);

  const copy = async () => {
    await navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <LiquidGlassSurface variant="toolbar" className="share-surface">
      <div className="share-actions">
        <Button variant="glass" size="sm" type="button" onClick={copy} title="复制分享 URL">
          <Copy size={16} />
          {copied ? "已复制" : "复制"}
        </Button>
      </div>
    </LiquidGlassSurface>
  );
}

function HopTable({
  active,
  mapData,
  selectedRouteNodeId,
  onSelectHop,
}: {
  active: TraceProbeResult;
  mapData: ResultMapData;
  selectedRouteNodeId: string | null;
  onSelectHop: (ttl: number) => void;
}) {
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const cardRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const selectedTtls = selectedRouteNodeId ? (mapData.routeNodeById.get(selectedRouteNodeId)?.ttlList ?? []) : [];

  useEffect(() => {
    const firstTtl = selectedTtls[0];
    if (firstTtl === undefined) return;
    rowRefs.current[firstTtl]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    cardRefs.current[firstTtl]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selectedRouteNodeId, selectedTtls]);

  if (!active.hops.length) {
    return <div className="table-empty">该 probe 还没有 hop 数据。</div>;
  }

  return (
    <div className="hop-layout">
      <div className="table-scroll hop-table-scroll">
        <Table className="hop-table">
          <TableHeader>
            <TableRow>
              <TableHead>TTL</TableHead>
              <TableHead>IP / hostname</TableHead>
              <TableHead>loss</TableHead>
              <TableHead>avg</TableHead>
              <TableHead>min</TableHead>
              <TableHead>max</TableHead>
              <TableHead>ASN</TableHead>
              <TableHead>region</TableHead>
              <TableHead>owner / ISP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.hops.map((hop) => {
              const routeNodeId = mapData.routeNodeIdByTtl.get(hop.ttl) || null;
              const selected = selectedTtls.includes(hop.ttl);
              const linked = Boolean(routeNodeId);
              return (
                <TableRow
                  key={`${hop.ttl}-${hop.ip || "empty"}`}
                  ref={(node) => {
                    rowRefs.current[hop.ttl] = node;
                  }}
                  className={`${linked ? "map-linked" : ""} ${selected ? "selected" : ""}`.trim()}
                  data-ttl={hop.ttl}
                  data-route-node-id={routeNodeId || undefined}
                  aria-selected={selected}
                  tabIndex={0}
                  title={linked ? `定位 TTL ${hop.ttl}` : `TTL ${hop.ttl} 没有可定位 GeoIP`}
                  onClick={() => onSelectHop(hop.ttl)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelectHop(hop.ttl);
                  }}
                >
                  <TableCell>{hop.ttl}</TableCell>
                  <TableCell className="endpoint-cell">{renderEndpoint(hop)}</TableCell>
                  <TableCell>{formatPercent(hop.stats?.loss)}</TableCell>
                  <TableCell>{formatMs(hop.stats?.avg)}</TableCell>
                  <TableCell>{formatMs(hop.stats?.min)}</TableCell>
                  <TableCell>{formatMs(hop.stats?.max)}</TableCell>
                  <TableCell>{formatAsn(hop)}</TableCell>
                  <TableCell>{formatRegion(hop)}</TableCell>
                  <TableCell>{formatOwner(hop)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="hop-card-list" aria-label="hop details">
        {active.hops.map((hop) => {
          const routeNodeId = mapData.routeNodeIdByTtl.get(hop.ttl) || null;
          const selected = selectedTtls.includes(hop.ttl);
          const linked = Boolean(routeNodeId);
          return (
            <button
              key={`${hop.ttl}-${hop.ip || "empty"}-card`}
              ref={(node) => {
                cardRefs.current[hop.ttl] = node;
              }}
              className={`hop-card${linked ? " map-linked" : ""}${selected ? " selected" : ""}`}
              type="button"
              data-ttl={hop.ttl}
              data-route-node-id={routeNodeId || undefined}
              aria-pressed={selected}
              title={linked ? `定位 TTL ${hop.ttl}` : `TTL ${hop.ttl} 没有可定位 GeoIP`}
              onClick={() => onSelectHop(hop.ttl)}
            >
              <span className="hop-card-ttl">TTL {hop.ttl}</span>
              <span className="hop-card-endpoint">{renderEndpoint(hop)}</span>
              <span className="hop-card-stat">
                <span>loss</span>
                <strong>{formatPercent(hop.stats?.loss)}</strong>
              </span>
              <span className="hop-card-stat">
                <span>avg</span>
                <strong>{formatMs(hop.stats?.avg)}</strong>
              </span>
              <span className="hop-card-meta">{formatAsn(hop)}</span>
              <span className="hop-card-detail">{formatRegion(hop)}</span>
              <span className="hop-card-detail">{formatOwner(hop)}</span>
              <span className="hop-card-timing">
                min {formatMs(hop.stats?.min)} · max {formatMs(hop.stats?.max)}
              </span>
            </button>
          );
        })}
      </div>

      <details className="raw-output">
        <summary>raw output</summary>
        <pre>{active.rawOutput || "no raw output"}</pre>
      </details>

      <details className="raw-output">
        <summary>whois / source details</summary>
        <pre>{JSON.stringify(active.hops.map(compactHopDetails), null, 2)}</pre>
      </details>
    </div>
  );
}

function EnrichmentStrip({ result }: { result: TraceResultResponse }) {
  const hasErrors = result.enrichment.errors.length > 0;
  return (
    <Surface variant="flat" className={`enrichment-strip ${result.enrichment.status}`} aria-label="GeoIP enrichment status">
      {hasErrors ? <AlertTriangle size={16} /> : <Server size={16} />}
      <span>GeoIP: {enrichmentLabel(result.enrichment.status)}</span>
      <Badge variant="muted">cache {result.enrichment.cached}</Badge>
      <Badge variant="muted">fetch {result.enrichment.fetched}</Badge>
      {hasErrors && <span className="notice-text">{result.enrichment.errors.length} batch error</span>}
    </Surface>
  );
}

function ResultMap({
  data,
  mapStyleUrl,
  mapProjection,
  selectedRouteNodeId,
  mapFocusRequest,
  onSelectRouteNode,
}: {
  data: ResultMapData;
  mapStyleUrl: string;
  mapProjection: MapProjection;
  selectedRouteNodeId: string | null;
  mapFocusRequest: number;
  onSelectRouteNode: (nodeId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dataRef = useRef(data);
  const selectedRouteNodeIdRef = useRef(selectedRouteNodeId);
  const onSelectRouteNodeRef = useRef(onSelectRouteNode);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const loadedRef = useRef(false);
  dataRef.current = data;
  selectedRouteNodeIdRef.current = selectedRouteNodeId;
  onSelectRouteNodeRef.current = onSelectRouteNode;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl,
      center: RESULT_MAP_DEFAULT_CENTER,
      zoom: RESULT_MAP_DEFAULT_ZOOM,
      aroundCenter: mapProjection === "globe",
    });
    let stopPulse: (() => void) | null = null;
    map.on("load", () => {
      map.setProjection({ type: mapProjection });
      map.addSource("result", { type: "geojson", data: dataRef.current.featureCollection });
      if (mapProjection === "globe") {
        map.addLayer({
          id: "result-line-glow",
          type: "line",
          source: "result",
          filter: ["==", ["get", "kind"], "path"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#7ffff5",
            "line-width": 9,
            "line-opacity": 0.34,
            "line-blur": 3.2,
          },
        });
      }
      map.addLayer({
        id: "result-line",
        type: "line",
        source: "result",
        filter: ["==", ["get", "kind"], "path"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": globeValue(mapProjection, "#72fff3", "#587f78"),
          "line-width": globeValue(mapProjection, 4.8, 2.5),
          "line-opacity": globeValue(mapProjection, 1, 0.76),
          "line-blur": globeValue(mapProjection, 0.4, 0),
        },
      });
      map.addLayer({
        id: "result-selected-hop",
        type: "circle",
        source: "result",
        filter: selectedHopFilter(selectedRouteNodeIdRef.current),
        paint: {
          "circle-radius": globeValue(mapProjection, 22, 19),
          "circle-color": globeValue(mapProjection, "rgba(255, 236, 92, 0.24)", "rgba(88, 127, 120, 0.18)"),
          "circle-stroke-color": globeValue(mapProjection, "#fff36a", "#ffffff"),
          "circle-stroke-width": 2.5,
        },
      });
      map.addLayer({
        id: "result-probe-points",
        type: "circle",
        source: "result",
        filter: ["==", ["get", "kind"], "probe"],
        paint: {
          "circle-radius": 7,
          "circle-color": globeValue(mapProjection, "#fff36a", "#9c8c72"),
          "circle-stroke-color": globeValue(mapProjection, "#2ffaff", "#ffffff"),
          "circle-stroke-width": 1.3,
          "circle-opacity": globeValue(mapProjection, 0.86, 1),
        },
      });
      map.addLayer({
        id: "result-points",
        type: "circle",
        source: "result",
        filter: ["==", ["get", "kind"], "hop"],
        paint: {
          "circle-radius": globeValue(mapProjection, 15, 14),
          "circle-color": globeValue(mapProjection, "#fff36a", "#587f78"),
          "circle-stroke-color": globeValue(mapProjection, "#2ffaff", "#ffffff"),
          "circle-stroke-width": 1.3,
          "circle-opacity": globeValue(mapProjection, 0.88, 1),
        },
      });
      map.addLayer({
        id: "result-hop-labels",
        type: "symbol",
        source: "result",
        filter: ["==", ["get", "kind"], "hop"],
        layout: {
          "text-field": ["get", "label"],
          "text-size": 10.5,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": globeValue(mapProjection, "rgba(0, 12, 16, 0.92)", "rgba(31, 38, 45, 0.28)"),
          "text-halo-width": globeValue(mapProjection, 1.3, 0.7),
        },
      });
      const selectFeature = (event: maplibregl.MapLayerMouseEvent) => {
        const feature = event.features?.find((item) => item.properties?.kind === "hop" && item.properties?.nodeId);
        const nodeId = String(feature?.properties?.nodeId || "");
        if (!nodeId) return;
        onSelectRouteNodeRef.current(nodeId);
        const node = dataRef.current.routeNodeById.get(nodeId);
        if (node) showRouteNodePopup(map, node, popupRef);
      };
      map.on("click", "result-points", selectFeature);
      map.on("click", "result-hop-labels", selectFeature);
      map.on("mouseenter", "result-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "result-points", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "result-hop-labels", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "result-hop-labels", () => {
        map.getCanvas().style.cursor = "";
      });
      loadedRef.current = true;
      applySelectedRouteNode(map, selectedRouteNodeIdRef.current, dataRef.current, popupRef);
      if (mapProjection === "globe") {
        stopPulse = startGlobePulse(map, [
          { layerId: "result-probe-points", property: "circle-opacity", min: 0.52, max: 1 },
          { layerId: "result-points", property: "circle-opacity", min: 0.58, max: 1 },
        ]);
      }
      fitResultMap(map, dataRef.current, mapProjection);
    });
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => map.resize());
    resizeObserver?.observe(containerRef.current);
    requestAnimationFrame(() => {
      map.resize();
      fitResultMap(map, dataRef.current, mapProjection);
    });
    mapRef.current = map;
    if (import.meta.env.DEV) {
      const element = containerRef.current as ResultMapDebugElement;
      element.__globalTraceResultMap = map;
      element.__globalTraceResultData = dataRef.current;
      element.__globalTraceSelectedRouteNodeId = selectedRouteNodeIdRef.current;
    }
    return () => {
      resizeObserver?.disconnect();
      stopPulse?.();
      popupRef.current?.remove();
      popupRef.current = null;
      loadedRef.current = false;
      if (containerRef.current) {
        const element = containerRef.current as ResultMapDebugElement;
        delete element.__globalTraceResultMap;
        delete element.__globalTraceResultData;
        delete element.__globalTraceSelectedRouteNodeId;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [mapProjection, mapStyleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("result") as GeoJSONSource | undefined;
    source?.setData(data.featureCollection);
    if (import.meta.env.DEV && containerRef.current) {
      const element = containerRef.current as ResultMapDebugElement;
      element.__globalTraceResultData = data;
      element.__globalTraceSelectedRouteNodeId = selectedRouteNodeIdRef.current;
    }
    if (map && source) {
      fitResultMap(map, data, mapProjection);
      applySelectedRouteNode(map, selectedRouteNodeIdRef.current, data, popupRef);
    }
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (import.meta.env.DEV && containerRef.current) {
      (containerRef.current as ResultMapDebugElement).__globalTraceSelectedRouteNodeId = selectedRouteNodeId;
    }
    if (!map || !loadedRef.current) return;
    applySelectedRouteNode(map, selectedRouteNodeId, dataRef.current, popupRef);
  }, [selectedRouteNodeId]);

  useEffect(() => {
    const map = mapRef.current;
    const node = selectedRouteNodeId ? data.routeNodeById.get(selectedRouteNodeId) : undefined;
    if (!map || !loadedRef.current || !node || mapFocusRequest === 0) return;
    showRouteNodePopup(map, node, popupRef);
    map.easeTo({ center: node.coordinate, duration: 420, essential: true });
  }, [data, mapFocusRequest, selectedRouteNodeId]);

  return <div className={`result-map${mapProjection === "globe" ? " result-map-globe" : ""}`} data-map-projection={mapProjection} ref={containerRef} aria-label="trace result map" />;
}

export function buildResultMapData(
  active: TraceProbeResult | null,
  allResults: TraceProbeResult[],
): ResultMapData {
  const features: Feature[] = [];
  for (const item of allResults) {
    if (!validMapCoordinate(item.probe.longitude, item.probe.latitude)) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [item.probe.longitude, item.probe.latitude] },
      properties: { kind: "probe", label: item.probe.city },
    });
  }

  const routeNodes = active ? buildRouteNodesForHops(active.hops).map(resultRouteNodeMetadata) : [];
  const routeCoordinates = routeNodes.map((node) => node.coordinate);
  if (routeCoordinates.length > 1) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: routeCoordinates },
      properties: { kind: "path" },
    });
  }
  for (const node of routeNodes) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: node.coordinate },
      properties: {
        kind: "hop",
        nodeId: node.nodeId,
        label: node.label,
        ttl: node.primaryHop.ttl,
        ttlList: node.ttlList,
        popupTitle: node.popupTitle,
        popupBody: node.popupBody,
      },
    });
  }
  const routeNodeById = new Map(routeNodes.map((node) => [node.nodeId, node]));
  const routeNodeIdByTtl = buildRouteNodeIdByTtl(routeNodes);

  return {
    featureCollection: { type: "FeatureCollection", features },
    fitCoordinates: resultFitCoordinates(active, routeCoordinates),
    routeNodes,
    routeNodeById,
    routeNodeIdByTtl,
  };
}

function resultRouteNodeMetadata(node: SharedResultRouteNode): ResultRouteNode {
  return {
    ...node,
    popupTitle: `TTL ${node.label}`,
    popupBody: routeNodePopupBody(node.hops),
  };
}

function selectedHopFilter(nodeId: string | null): maplibregl.FilterSpecification {
  return ["all", ["==", ["get", "kind"], "hop"], ["==", ["get", "nodeId"], nodeId || "__none__"]] as maplibregl.FilterSpecification;
}

function applySelectedRouteNode(
  map: maplibregl.Map,
  selectedRouteNodeId: string | null,
  data: ResultMapData,
  popupRef: MutableRefObject<maplibregl.Popup | null>,
): void {
  map.setFilter("result-selected-hop", selectedHopFilter(selectedRouteNodeId));
  const node = selectedRouteNodeId ? data.routeNodeById.get(selectedRouteNodeId) : undefined;
  if (!node) {
    popupRef.current?.remove();
    popupRef.current = null;
    return;
  }
  showRouteNodePopup(map, node, popupRef);
}

function showRouteNodePopup(
  map: maplibregl.Map,
  node: ResultRouteNode,
  popupRef: MutableRefObject<maplibregl.Popup | null>,
): void {
  popupRef.current?.remove();
  popupRef.current = new maplibregl.Popup({ className: "result-map-popup-shell", closeButton: false, closeOnClick: false, offset: 14 })
    .setLngLat(node.coordinate)
    .setHTML(routeNodePopupHtml(node))
    .addTo(map);
}

function routeNodePopupHtml(node: ResultRouteNode): string {
  return `<div class="result-map-popup"><strong>${escapeHtml(node.popupTitle)}</strong><span>${escapeHtml(node.popupBody)}</span></div>`;
}

function routeNodePopupBody(hops: TraceHop[]): string {
  return hops
    .map((hop) => {
      const endpoint = [hop.ip || "*", displayHostname(hop.hostname, hop.ip || "*")].filter(Boolean).join(" / ");
      return [endpoint, formatAsn(hop), formatRegion(hop), formatOwner(hop)].filter((item) => item && item !== "-").join(" · ");
    })
    .filter(Boolean)
    .join("\n");
}

function fitResultMap(map: maplibregl.Map, data: ResultMapData, mapProjection: MapProjection): void {
  const coordinates = data.fitCoordinates;
  const globe = mapProjection === "globe";
  if (coordinates.length === 0) {
    map.easeTo({
      center: RESULT_MAP_DEFAULT_CENTER,
      zoom: RESULT_MAP_DEFAULT_ZOOM,
      duration: 420,
      essential: true,
    });
    return;
  }
  if (coordinates.length === 1) {
    map.easeTo({
      center: coordinates[0],
      zoom: globe ? 4.2 : RESULT_MAP_SINGLE_POINT_ZOOM,
      duration: 420,
      essential: true,
    });
    return;
  }
  const bounds = coordinateBounds(coordinates);
  if (!bounds) {
    map.easeTo({
      center: coordinates[0],
      zoom: globe ? 4.2 : RESULT_MAP_SINGLE_POINT_ZOOM,
      duration: 420,
      essential: true,
    });
    return;
  }
  map.fitBounds(bounds, {
    padding: globe ? { top: 96, right: 120, bottom: 96, left: 120 } : { top: 38, right: 38, bottom: 38, left: 38 },
    maxZoom: globe ? 4.4 : RESULT_MAP_MAX_ZOOM,
    duration: 420,
    essential: true,
  });
}

function globeValue<T, U>(projection: MapProjection, globe: T, mercator: U): T | U {
  return projection === "globe" ? globe : mercator;
}

function startGlobePulse(
  map: maplibregl.Map,
  targets: Array<{ layerId: string; property: string; min: number; max: number }>,
): () => void {
  let bright = false;
  const interval = window.setInterval(() => {
    bright = !bright;
    for (const target of targets) {
      map.setPaintProperty(target.layerId, target.property, bright ? target.max : target.min);
    }
  }, 1400);
  return () => window.clearInterval(interval);
}

function resultFitCoordinates(active: TraceProbeResult | null, routeCoordinates: ResultMapCoordinate[]): ResultMapCoordinate[] {
  if (!active) return [];
  const coordinates: ResultMapCoordinate[] = [...routeCoordinates];
  if (validMapCoordinate(active.probe.longitude, active.probe.latitude)) {
    const probeCoordinate: ResultMapCoordinate = [active.probe.longitude, active.probe.latitude];
    coordinates.push(routeCoordinates[0] ? nearestWorldCoordinate(probeCoordinate, routeCoordinates[0]) : probeCoordinate);
  }
  return coordinates;
}

function coordinateBounds(coordinates: ResultMapCoordinate[]): [ResultMapCoordinate, ResultMapCoordinate] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of coordinates) {
    west = Math.min(west, lng);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
  }
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (west === east && south === north) return null;
  return [
    [west, south],
    [east, north],
  ];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

function formatMs(value: number | null | undefined): string {
  return typeof value === "number" ? `${value.toFixed(1)} ms` : "-";
}

function renderEndpoint(hop: TraceHop) {
  const ip = hop.ip || "*";
  const hostname = displayHostname(hop.hostname, ip);
  return (
    <div className="endpoint-stack">
      <span className="mono-cell">{ip}</span>
      {hostname && <span className="endpoint-hostname">{hostname}</span>}
    </div>
  );
}

function displayHostname(hostname: string | null, ip: string): string | null {
  const next = hostname?.trim();
  if (!next || next === "-" || next === ip) return null;
  return next;
}

function formatPercent(value: number | null | undefined): string {
  return typeof value === "number" ? `${value.toFixed(1)}%` : "-";
}

function formatAsn(hop: TraceHop): string {
  if (hop.geo?.asnumber) return hop.geo.asnumber;
  return hop.asn.length ? hop.asn.map((asn) => `AS${asn}`).join(", ") : "-";
}

function formatOwner(hop: TraceHop): string {
  const seen = new Set<string>();
  const values = [hop.geo?.owner, hop.geo?.isp, hop.geo?.domain]
    .map((item) => item?.trim())
    .filter((item): item is string => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return values.join(" / ") || "-";
}

function formatRegion(hop: TraceHop): string {
  return [hop.geo?.country || hop.geo?.country_en, hop.geo?.prov || hop.geo?.prov_en, hop.geo?.city || hop.geo?.city_en]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join("，") || "-";
}

function compactHopDetails(hop: TraceHop) {
  return {
    ttl: hop.ttl,
    ip: hop.ip,
    hostname: hop.hostname,
    whois: hop.geo?.whois,
    prefix: hop.geo?.prefix,
    router: hop.geo?.router,
    source: hop.geo?.source,
    error: hop.enrichmentError,
  };
}

function resultSummary(result: TraceResultResponse, active: TraceProbeResult | null) {
  const finished = result.results.filter((item) => item.status === "finished").length;
  const hopCount = active?.hops.length || 0;
  const targetHop = findTargetHop(active);
  const targetLoss = targetHop?.stats ? formatPercent(targetHop.stats.loss) : "N/A";
  const targetLatency =
    targetHop?.stats && targetHop.stats.loss < 100 && typeof targetHop.stats.avg === "number"
      ? formatMs(targetHop.stats.avg)
      : "N/A";

  return [
    { label: "status", value: result.status },
    { label: "probes", value: `${finished}/${result.probesCount}` },
    { label: "hops", value: String(hopCount) },
    { label: "目标延迟", value: targetLatency },
    { label: "目标丢包", value: targetLoss },
  ];
}

function findTargetHop(active: TraceProbeResult | null): TraceHop | null {
  const targetIp = active?.resolvedAddress?.trim();
  if (!targetIp) return null;
  return active?.hops.find((hop) => hop.ip === targetIp) || null;
}

function enrichmentLabel(status: TraceResultResponse["enrichment"]["status"]): string {
  if (status === "complete") return "完成";
  if (status === "partial") return "部分完成";
  return "跳过";
}
