import "./maplibre.css";
import maplibregl, { type ExpressionSpecification, type GeoJSONSource } from "maplibre-gl";
import { Clock3, ExternalLink, Globe2, Map as MapIcon, Route, Share2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
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
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import type { MapProjection } from "./mapProjection";

const RESULT_MAP_DEFAULT_CENTER: [number, number] = [8, 25];
const RESULT_MAP_DEFAULT_ZOOM = 1.4;
const RESULT_MAP_SINGLE_POINT_ZOOM = 5;
const RESULT_MAP_MAX_ZOOM = 5.8;
const RESULT_ROUTE_COLORS = ["#14b8a6", "#f97316", "#8b5cf6", "#22c55e", "#0ea5e9", "#e11d48", "#facc15", "#06b6d4", "#a855f7", "#84cc16"];
const RESULT_PACKET_SPACING_KM = 1800;
const RESULT_PACKET_SPEED_KM_PER_SECOND = 900;
const RESULT_ROUTE_DISPLAY_SEGMENT_KM = 350;
const EARTH_RADIUS_KM = 6371.0088;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;

type ResultMapCoordinate = ResultRouteCoordinate;
type RouteEndpointRole = "start" | "end" | "single" | "middle";

interface ResultMapData {
  featureCollection: FeatureCollection;
  packetFeatureCollection: FeatureCollection;
  fitCoordinates: ResultMapCoordinate[];
  routes: ResultMapRoute[];
  routeNodes: ResultRouteNode[];
  routeNodeById: Map<string, ResultRouteNode>;
  routeNodeIdByTtl: Map<number, string>;
  activeRouteIndex: number;
  activeRouteId: string | null;
}

interface ResultMapRoute {
  routeId: string;
  resultId: string;
  resultIndex: number;
  color: string;
  active: boolean;
  pathCoordinates: ResultMapCoordinate[];
  pathSections: ResultMapCoordinate[][];
  pathSegments: ResultRouteSegment[];
  pathLengthKm: number;
  fitCoordinates: ResultMapCoordinate[];
  routeNodes: ResultRouteNode[];
  routeNodeIdByTtl: Map<number, string>;
}

interface ResultRouteSegment {
  start: ResultMapCoordinate;
  end: ResultMapCoordinate;
  startKm: number;
  endKm: number;
}

interface ResultRouteNode extends SharedResultRouteNode {
  routeId: string;
  resultId: string;
  resultIndex: number;
  color: string;
  active: boolean;
  endpointRole: RouteEndpointRole;
  popupTitle: string;
  popupBody: string;
}

interface ResultMapDebugElement extends HTMLElement {
  __globalTraceResultMap?: maplibregl.Map;
  __globalTraceResultData?: ResultMapData;
  __globalTraceSelectedRouteNodeId?: string | null;
  __globalTraceResultMapReady?: boolean;
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
  const activeIndex = result?.results[selected] ? selected : 0;
  const active = result?.results[activeIndex] || null;
  const mapData = useMemo(() => buildResultMapData(active, result?.results || []), [active, result?.results]);

  useEffect(() => {
    setSelected(0);
    setSelectedRouteNodeId(null);
  }, [result?.measurementId]);

  const selectProbe = (index: number) => {
    setSelected(index);
    setSelectedRouteNodeId(null);
  };

  const selectRouteNode = (nodeId: string | null, focusMap = false, routeIndex?: number) => {
    if (typeof routeIndex === "number" && result?.results[routeIndex]) setSelected(routeIndex);
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
            <Button
              variant="glass"
              size="sm"
              className="result-command-button"
              type="button"
              onClick={onClose}
              title="关闭结果"
              aria-label="关闭结果"
            >
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
        <GeoIpMetric result={result} />
      </div>

      <Tabs className="probe-tabs-root" value={String(activeIndex)} onValueChange={(value) => selectProbe(Number(value))}>
        <TabsList className="probe-tabs" aria-label="probe results">
          {result.results.map((item, index) => (
            <TabsTrigger key={item.id} value={String(index)} style={routeTabStyle(index)} onClick={() => selectProbe(index)}>
              <span className="probe-tab-route-dot" aria-hidden="true" />
              <span className="probe-tab-copy">
                <strong>{item.probe.city || item.probe.country}</strong>
                <span className="probe-tab-meta">AS{item.probe.asn} · {item.status}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={String(activeIndex)} className="probe-tab-content">
          {renderMap && (
            <ResultMap
              data={mapData}
              mapStyleUrl={mapStyleUrl}
              mapProjection={mapProjection}
              selectedRouteNodeId={selectedRouteNodeId}
              mapFocusRequest={mapFocusRequest}
              onSelectRouteNode={(nodeId, routeIndex) => selectRouteNode(nodeId, false, routeIndex)}
            />
          )}

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
            variant="ghost"
            size="sm"
            className="result-view-button"
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
            variant="ghost"
            size="sm"
            className="result-view-button"
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
    <Button
      variant="glass"
      size="sm"
      className="result-command-button"
      type="button"
      onClick={copy}
      title="分享诊断链接"
    >
      <Share2 size={16} />
      {copied ? "已复制" : "分享"}
    </Button>
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
    const failure = active.status === "failed" && active.rawOutput ? `该 probe 失败：${active.rawOutput}` : "该 probe 还没有 hop 数据。";
    return <div className="table-empty">{failure}</div>;
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
                  <TableCell className="endpoint-cell">{renderEndpoint(hop, { showPeerLink: true })}</TableCell>
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

function GeoIpMetric({ result }: { result: TraceResultResponse }) {
  const hasErrors = result.enrichment.errors.length > 0;
  return (
    <div className={`metric geoip ${result.enrichment.status}`} aria-label="GeoIP enrichment status">
      <span>GeoIP</span>
      <strong>
        {enrichmentLabel(result.enrichment.status)} · cache {result.enrichment.cached} · fetch {result.enrichment.fetched}
      </strong>
      {hasErrors && <span className="metric-detail notice-text">{enrichmentErrorSummary(result.enrichment.errors)}</span>}
    </div>
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
  onSelectRouteNode: (nodeId: string, routeIndex?: number) => void;
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
    let stopPackets: (() => void) | null = null;
    map.on("load", () => {
      map.setProjection({ type: mapProjection });
      map.addSource("result", { type: "geojson", data: dataRef.current.featureCollection });
      const animatePackets = !prefersReducedMotion();
      map.addSource("result-packets", {
        type: "geojson",
        data: animatePackets ? dataRef.current.packetFeatureCollection : emptyFeatureCollection(),
      });
      if (mapProjection === "globe") {
        map.addLayer({
          id: "result-line-glow",
          type: "line",
          source: "result",
          filter: ["==", ["get", "kind"], "path"],
          layout: { "line-join": "round", "line-cap": "round", "line-sort-key": activeNumberExpression(1, 0) },
          paint: {
            "line-color": routeColorExpression(),
            "line-width": activeNumberExpression(10, 3.8),
            "line-opacity": activeNumberExpression(0.4, 0.07),
            "line-blur": 3.2,
          },
        });
      }
      map.addLayer({
        id: "result-line",
        type: "line",
        source: "result",
        filter: ["==", ["get", "kind"], "path"],
        layout: { "line-join": "round", "line-cap": "round", "line-sort-key": activeNumberExpression(1, 0) },
        paint: {
          "line-color": routeColorExpression(),
          "line-width": activeNumberExpression(globeValue(mapProjection, 5.4, 2.9), globeValue(mapProjection, 2.1, 1.25)),
          "line-opacity": activeNumberExpression(globeValue(mapProjection, 1, 0.86), globeValue(mapProjection, 0.2, 0.18)),
          "line-blur": globeValue(mapProjection, 0.4, 0),
        },
      });
      map.addLayer({
        id: "result-packets",
        type: "circle",
        source: "result-packets",
        filter: ["==", ["get", "kind"], "packet"],
        paint: {
          "circle-radius": activeNumberExpression(3, 2),
          "circle-color": routeColorExpression(),
          "circle-opacity": activeNumberExpression(0.98, 0.34),
          "circle-blur": activeNumberExpression(0.14, 0.28),
          "circle-stroke-color": globeValue(mapProjection, "rgba(255, 255, 255, 0.94)", "rgba(255, 255, 255, 0.78)"),
          "circle-stroke-width": activeNumberExpression(0.8, 0.4),
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
          "circle-stroke-color": routeColorExpression(),
          "circle-stroke-width": 2.5,
        },
      });
      map.addLayer({
        id: "result-probe-points",
        type: "circle",
        source: "result",
        filter: ["==", ["get", "kind"], "probe"],
        paint: {
          "circle-radius": activeNumberExpression(7, 5.5),
          "circle-color": routeColorExpression(),
          "circle-stroke-color": globeValue(mapProjection, "#ffffff", "#ffffff"),
          "circle-stroke-width": 1.3,
          "circle-opacity": activeNumberExpression(globeValue(mapProjection, 0.86, 1), globeValue(mapProjection, 0.36, 0.3)),
        },
      });
      map.addLayer({
        id: "result-endpoint-shadow",
        type: "circle",
        source: "result",
        filter: endpointFilter(),
        paint: {
          "circle-radius": activeNumberExpression(globeValue(mapProjection, 19, 17), globeValue(mapProjection, 14, 12)),
          "circle-color": "rgba(0, 0, 0, 0.42)",
          "circle-opacity": activeNumberExpression(0.34, 0.14),
          "circle-blur": 0.55,
          "circle-translate": [0, 4],
        },
      });
      map.addLayer({
        id: "result-endpoint-halo",
        type: "circle",
        source: "result",
        filter: endpointFilter(),
        paint: {
          "circle-radius": activeNumberExpression(globeValue(mapProjection, 18, 16), globeValue(mapProjection, 13, 11)),
          "circle-color": routeColorExpression(),
          "circle-opacity": activeNumberExpression(0.34, 0.15),
          "circle-blur": 0.22,
          "circle-stroke-color": "rgba(255, 255, 255, 0.72)",
          "circle-stroke-width": activeNumberExpression(1.8, 0.8),
        },
      });
      map.addLayer({
        id: "result-points",
        type: "circle",
        source: "result",
        filter: ["==", ["get", "kind"], "hop"],
        paint: {
          "circle-radius": activeNumberExpression(globeValue(mapProjection, 15, 14), globeValue(mapProjection, 11, 10)),
          "circle-color": routeColorExpression(),
          "circle-stroke-color": globeValue(mapProjection, "rgba(255, 255, 255, 0.92)", "#ffffff"),
          "circle-stroke-width": 1.3,
          "circle-opacity": activeNumberExpression(globeValue(mapProjection, 0.88, 1), globeValue(mapProjection, 0.34, 0.3)),
        },
      });
      map.addLayer({
        id: "result-endpoint-core",
        type: "circle",
        source: "result",
        filter: endpointFilter(),
        paint: {
          "circle-radius": activeNumberExpression(globeValue(mapProjection, 9.5, 8.8), globeValue(mapProjection, 7.2, 6.8)),
          "circle-color": routeColorExpression(),
          "circle-opacity": activeNumberExpression(1, 0.58),
          "circle-stroke-color": "rgba(255, 255, 255, 0.96)",
          "circle-stroke-width": activeNumberExpression(2.2, 1.3),
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
        const routeIndex = Number(feature?.properties?.routeIndex);
        onSelectRouteNodeRef.current(nodeId, Number.isFinite(routeIndex) ? routeIndex : undefined);
        const node = dataRef.current.routeNodeById.get(nodeId);
        if (node) showRouteNodePopup(map, node, popupRef);
      };
      for (const layerId of ["result-points", "result-endpoint-halo", "result-endpoint-core", "result-hop-labels"]) {
        map.on("click", layerId, selectFeature);
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }
      if (animatePackets) {
        stopPackets = startPacketAnimation(map, dataRef);
      }
      loadedRef.current = true;
      if (import.meta.env.DEV && containerRef.current) {
        (containerRef.current as ResultMapDebugElement).__globalTraceResultMapReady = true;
      }
      applySelectedRouteNode(map, selectedRouteNodeIdRef.current, dataRef.current, popupRef);
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
      element.__globalTraceResultMapReady = false;
    }
    return () => {
      resizeObserver?.disconnect();
      stopPackets?.();
      popupRef.current?.remove();
      popupRef.current = null;
      loadedRef.current = false;
      if (containerRef.current) {
        const element = containerRef.current as ResultMapDebugElement;
        delete element.__globalTraceResultMap;
        delete element.__globalTraceResultData;
        delete element.__globalTraceSelectedRouteNodeId;
        delete element.__globalTraceResultMapReady;
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
  const activeRouteIndex = active ? Math.max(0, allResults.findIndex((item) => item.id === active.id)) : -1;
  const routes: ResultMapRoute[] = [];

  for (const [resultIndex, item] of allResults.entries()) {
    const routeId = resultRouteId(resultIndex);
    const color = resultRouteColor(resultIndex);
    const activeRoute = resultIndex === activeRouteIndex;
    if (validMapCoordinate(item.probe.longitude, item.probe.latitude)) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [item.probe.longitude, item.probe.latitude] },
        properties: {
          kind: "probe",
          routeId,
          routeIndex: resultIndex,
          resultId: item.id,
          label: item.probe.city,
          color,
          active: activeRoute,
        },
      });
    }

    const sharedRouteNodes = buildRouteNodesForHops(item.hops);
    const routeNodes = sharedRouteNodes.map((node, nodeIndex) =>
      resultRouteNodeMetadata(node, {
        routeId,
        resultId: item.id,
        resultIndex,
        color,
        active: activeRoute,
        nodeIndex,
        nodeCount: sharedRouteNodes.length,
      }),
    );
    const routeCoordinates = routeNodes.map((node) => node.coordinate);
    const pathSections = continuousRouteNodeSections(routeNodes)
      .map((section) => resultDisplayRouteCoordinates(section.map((node) => node.coordinate)))
      .filter((section) => section.length > 0);
    const displayCoordinates = pathSections.flat();
    const pathSegments = pathSections.flatMap(resultRouteSegments);
    const pathLengthKm = pathSections.reduce((total, section) => total + routeSectionLengthKm(section), 0);
    for (const [sectionIndex, section] of pathSections.entries()) {
      if (section.length <= 1) continue;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: section },
        properties: { kind: "path", routeId, routeIndex: resultIndex, resultId: item.id, sectionIndex, color, active: activeRoute },
      });
    }
    for (const node of routeNodes) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: node.coordinate },
        properties: {
          kind: "hop",
          routeId,
          routeIndex: resultIndex,
          resultId: item.id,
          color,
          active: activeRoute,
          endpoint: node.endpointRole !== "middle",
          endpointRole: node.endpointRole,
          nodeId: node.nodeId,
          label: node.label,
          ttl: node.primaryHop.ttl,
          ttlList: node.ttlList,
          popupTitle: node.popupTitle,
          popupBody: node.popupBody,
        },
      });
    }
    routes.push({
      routeId,
      resultId: item.id,
      resultIndex,
      color,
      active: activeRoute,
      pathCoordinates: displayCoordinates,
      pathSections,
      pathSegments,
      pathLengthKm,
      fitCoordinates: resultFitCoordinates(item, routeCoordinates),
      routeNodes,
      routeNodeIdByTtl: buildRouteNodeIdByTtl(routeNodes),
    });
  }

  const activeRoute = routes.find((route) => route.resultIndex === activeRouteIndex) || null;
  const allRouteNodes = routes.flatMap((route) => route.routeNodes);
  const routeNodeById = new Map(allRouteNodes.map((node) => [node.nodeId, node]));

  return {
    featureCollection: { type: "FeatureCollection", features },
    packetFeatureCollection: buildPacketFeatureCollection(routes, 0),
    fitCoordinates: activeRoute?.fitCoordinates || [],
    routes,
    routeNodes: activeRoute?.routeNodes || [],
    routeNodeById,
    routeNodeIdByTtl: activeRoute?.routeNodeIdByTtl || new Map(),
    activeRouteIndex,
    activeRouteId: activeRoute?.routeId || null,
  };
}

function resultRouteNodeMetadata(
  node: SharedResultRouteNode,
  route: {
    routeId: string;
    resultId: string;
    resultIndex: number;
    color: string;
    active: boolean;
    nodeIndex: number;
    nodeCount: number;
  },
): ResultRouteNode {
  const endpointRole = resultEndpointRole(route.nodeIndex, route.nodeCount);
  return {
    ...node,
    nodeId: `${route.routeId}-node-${node.ttlList.join("-") || route.nodeIndex}`,
    routeId: route.routeId,
    resultId: route.resultId,
    resultIndex: route.resultIndex,
    color: route.color,
    active: route.active,
    endpointRole,
    popupTitle: `TTL ${node.label}`,
    popupBody: routeNodePopupBody(node.hops),
  };
}

function resultRouteId(index: number): string {
  return `route-${index}`;
}

function resultRouteColor(index: number): string {
  return RESULT_ROUTE_COLORS[index % RESULT_ROUTE_COLORS.length];
}

function routeTabStyle(index: number): CSSProperties {
  return { "--route-color": resultRouteColor(index) } as CSSProperties;
}

function resultEndpointRole(index: number, count: number): RouteEndpointRole {
  if (count <= 1) return "single";
  if (index === 0) return "start";
  if (index === count - 1) return "end";
  return "middle";
}

function continuousRouteNodeSections(nodes: ResultRouteNode[]): ResultRouteNode[][] {
  const sections: ResultRouteNode[][] = [];
  for (const node of nodes) {
    const previous = sections.at(-1)?.at(-1);
    if (!previous || firstTtl(node) !== lastTtl(previous) + 1) {
      sections.push([node]);
      continue;
    }
    sections.at(-1)?.push(node);
  }
  return sections;
}

function firstTtl(node: ResultRouteNode): number {
  return node.ttlList[0] ?? node.primaryHop.ttl;
}

function lastTtl(node: ResultRouteNode): number {
  return node.ttlList.at(-1) ?? node.primaryHop.ttl;
}

function selectedHopFilter(nodeId: string | null): maplibregl.FilterSpecification {
  return ["all", ["==", ["get", "kind"], "hop"], ["==", ["get", "nodeId"], nodeId || "__none__"]] as maplibregl.FilterSpecification;
}

function endpointFilter(): maplibregl.FilterSpecification {
  return ["all", ["==", ["get", "kind"], "hop"], ["==", ["get", "endpoint"], true]] as maplibregl.FilterSpecification;
}

function routeColorExpression(): ExpressionSpecification {
  return ["coalesce", ["get", "color"], "#587f78"] as ExpressionSpecification;
}

function activeNumberExpression(active: number, inactive: number): ExpressionSpecification {
  return ["case", ["boolean", ["get", "active"], false], active, inactive] as ExpressionSpecification;
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

function startPacketAnimation(
  map: maplibregl.Map,
  dataRef: MutableRefObject<ResultMapData>,
): () => void {
  let frame = 0;
  const startedAt = performance.now();
  const tick = (now: number) => {
    const source = map.getSource("result-packets") as GeoJSONSource | undefined;
    source?.setData(buildPacketFeatureCollection(dataRef.current.routes, now - startedAt));
    frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  return () => window.cancelAnimationFrame(frame);
}

export function buildPacketFeatureCollection(routes: ResultMapRoute[], elapsedMs: number): FeatureCollection {
  const features: Feature[] = [];
  const elapsedKm = (elapsedMs / 1000) * RESULT_PACKET_SPEED_KM_PER_SECOND;
  for (const route of routes) {
    for (const [sectionIndex, section] of route.pathSections.entries()) {
      const sectionSegments = resultRouteSegments(section);
      const sectionLengthKm = sectionSegments.at(-1)?.endKm || 0;
      if (sectionSegments.length === 0 || sectionLengthKm <= 0) continue;
      const packetCount = Math.max(1, Math.floor(sectionLengthKm / RESULT_PACKET_SPACING_KM));
      for (let index = 0; index < packetCount; index += 1) {
        const distanceKm = positiveModulo(elapsedKm + index * RESULT_PACKET_SPACING_KM, sectionLengthKm);
        const coordinate = routeCoordinateAtDistance(sectionSegments, distanceKm);
        if (!coordinate) continue;
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: coordinate },
          properties: {
            kind: "packet",
            routeId: route.routeId,
            routeIndex: route.resultIndex,
            resultId: route.resultId,
            sectionIndex,
            packetIndex: index,
            distanceKm,
            pathLengthKm: sectionLengthKm,
            color: route.color,
            active: route.active,
          },
        });
      }
    }
  }
  return { type: "FeatureCollection", features };
}

function resultDisplayRouteCoordinates(coordinates: ResultMapCoordinate[]): ResultMapCoordinate[] {
  if (coordinates.length < 2) return coordinates;
  const displayCoordinates: ResultMapCoordinate[] = [coordinates[0]];
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    const previousProjected = projectWebMercator(previous);
    const currentProjected = projectWebMercator(current);
    const projectedDistanceKm = Math.hypot(currentProjected.x - previousProjected.x, currentProjected.y - previousProjected.y);
    const steps = Math.max(1, Math.ceil(projectedDistanceKm / RESULT_ROUTE_DISPLAY_SEGMENT_KM));
    for (let step = 1; step < steps; step += 1) {
      const ratio = step / steps;
      displayCoordinates.push(
        unprojectWebMercator({
          x: previousProjected.x + (currentProjected.x - previousProjected.x) * ratio,
          y: previousProjected.y + (currentProjected.y - previousProjected.y) * ratio,
        }),
      );
    }
    displayCoordinates.push(current);
  }
  return displayCoordinates;
}

function resultRouteSegments(coordinates: ResultMapCoordinate[]): ResultRouteSegment[] {
  if (coordinates.length < 2) return [];
  const segments: ResultRouteSegment[] = [];
  let previousEndKm = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    const lengthKm = coordinateDistanceKm(previous, current);
    if (lengthKm <= 0) continue;
    const endKm = previousEndKm + lengthKm;
    segments.push({ start: previous, end: current, startKm: previousEndKm, endKm });
    previousEndKm = endKm;
  }
  return segments;
}

function routeSectionLengthKm(coordinates: ResultMapCoordinate[]): number {
  return resultRouteSegments(coordinates).at(-1)?.endKm || 0;
}

function routeCoordinateAtDistance(segments: ResultRouteSegment[], distanceKm: number): ResultMapCoordinate | null {
  for (const segment of segments) {
    if (distanceKm > segment.endKm) continue;
    const segmentLengthKm = segment.endKm - segment.startKm;
    const ratio = segmentLengthKm > 0 ? (distanceKm - segment.startKm) / segmentLengthKm : 0;
    return webMercatorInterpolate(segment.start, segment.end, ratio);
  }
  return segments.at(-1)?.end || null;
}

function webMercatorInterpolate(start: ResultMapCoordinate, end: ResultMapCoordinate, ratio: number): ResultMapCoordinate {
  const projectedStart = projectWebMercator(start);
  const projectedEnd = projectWebMercator(end);
  return unprojectWebMercator({
    x: projectedStart.x + (projectedEnd.x - projectedStart.x) * ratio,
    y: projectedStart.y + (projectedEnd.y - projectedStart.y) * ratio,
  });
}

function projectWebMercator(coordinate: ResultMapCoordinate): { x: number; y: number } {
  const lat = Math.max(-WEB_MERCATOR_MAX_LATITUDE, Math.min(WEB_MERCATOR_MAX_LATITUDE, coordinate[1]));
  return {
    x: EARTH_RADIUS_KM * degreesToRadians(coordinate[0]),
    y: EARTH_RADIUS_KM * Math.log(Math.tan(Math.PI / 4 + degreesToRadians(lat) / 2)),
  };
}

function unprojectWebMercator(point: { x: number; y: number }): ResultMapCoordinate {
  return [
    radiansToDegrees(point.x / EARTH_RADIUS_KM),
    radiansToDegrees(2 * Math.atan(Math.exp(point.y / EARTH_RADIUS_KM)) - Math.PI / 2),
  ];
}

function coordinateDistanceKm(left: ResultMapCoordinate, right: ResultMapCoordinate): number {
  const leftLat = degreesToRadians(left[1]);
  const rightLat = degreesToRadians(right[1]);
  const deltaLat = degreesToRadians(right[1] - left[1]);
  const deltaLng = degreesToRadians(shortLongitudeDelta(right[0] - left[0]));
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shortLongitudeDelta(delta: number): number {
  let value = delta;
  while (value > 180) value -= 360;
  while (value <= -180) value += 360;
  return value;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function emptyFeatureCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function prefersReducedMotion(): boolean {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
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

function renderEndpoint(hop: TraceHop, options: { showPeerLink?: boolean } = {}) {
  const ip = hop.ip || "*";
  const hostname = displayHostname(hop.hostname, ip);
  return (
    <div className="endpoint-stack">
      <span className="endpoint-address-row">
        <span className="mono-cell">{ip}</span>
        {options.showPeerLink && hop.ip && (
          <a
            aria-label={`在 peer.as 查看 ${hop.ip}`}
            className="peer-link"
            href={peerAsUrl(hop.ip)}
            rel="noopener noreferrer"
            target="_blank"
            title={`在 peer.as 查看 ${hop.ip}`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <ExternalLink aria-hidden="true" />
          </a>
        )}
      </span>
      {hostname && <span className="endpoint-hostname">{hostname}</span>}
    </div>
  );
}

function peerAsUrl(ip: string): string {
  return `https://peer.as/?q=${encodeURIComponent(ip)}`;
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
  const failed = result.results.filter((item) => item.status === "failed" || item.status === "error").length;
  const hopCount = active?.hops.length || 0;
  const targetHop = findTargetHop(active);
  const targetLoss = targetHop?.stats ? formatPercent(targetHop.stats.loss) : "N/A";
  const targetLatency =
    targetHop?.stats && targetHop.stats.loss < 100 && typeof targetHop.stats.avg === "number"
      ? formatMs(targetHop.stats.avg)
      : "N/A";

  const summary = [
    { label: "status", value: result.status },
    { label: "probes", value: `${finished}/${result.probesCount}` },
    { label: "hops", value: String(hopCount) },
    { label: "目标延迟", value: targetLatency },
    { label: "目标丢包", value: targetLoss },
  ];
  if (failed > 0) {
    summary.splice(2, 0, { label: "失败 probes", value: String(failed) });
  }
  return summary;
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

function enrichmentErrorSummary(errors: TraceResultResponse["enrichment"]["errors"]): string {
  const failedIpCount = new Set(errors.flatMap((error) => error.ips)).size;
  const messages = [...new Set(errors.map((error) => error.message.trim()).filter(Boolean))].slice(0, 2);
  const prefix = failedIpCount > 0 ? `${failedIpCount} IP 失败` : `${errors.length} batch error`;
  return messages.length ? `${prefix}: ${messages.join("; ")}` : prefix;
}
