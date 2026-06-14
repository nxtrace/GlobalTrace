import "./maplibre.css";
import maplibregl, { type ExpressionSpecification, type GeoJSONSource } from "maplibre-gl";
import { Clock3, ExternalLink, Globe2, Map as MapIcon, Route, Share2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Feature, FeatureCollection } from "geojson";
import { MAX_TRACE_PACKETS, type TraceHop, type TraceProbeResult, type TraceResultResponse } from "../../shared/types";
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
const RESULT_ROUTE_GROUP_OFFSET_PX = 15;
const RESULT_ROUTE_FAN_RADIUS_PX = 31;
const EARTH_RADIUS_KM = 6371.0088;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;

type ResultMapCoordinate = ResultRouteCoordinate;
type RouteEndpointRole = "start" | "end" | "single" | "middle";
type ResultMarkerOffset = [number, number];
type GroupStateSetter = Dispatch<SetStateAction<string | null>>;

interface ResultMapData {
  featureCollection: FeatureCollection;
  packetFeatureCollection: FeatureCollection;
  fitCoordinates: ResultMapCoordinate[];
  routes: ResultMapRoute[];
  routeNodes: ResultRouteNode[];
  routeGroups: ResultRouteGroup[];
  routeNodeById: Map<string, ResultRouteNode>;
  routeNodeIdByTtl: Map<number, string>;
  routeGroupById: Map<string, ResultRouteGroup>;
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
  routeGroups: ResultRouteGroup[];
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
  routeOffset: ResultMarkerOffset;
  popupTitle: string;
  popupBody: string;
}

interface ResultRouteGroup {
  groupId: string;
  routeId: string;
  resultId: string;
  resultIndex: number;
  color: string;
  active: boolean;
  coordinate: ResultMapCoordinate;
  label: string;
  nodeIds: string[];
  nodes: ResultRouteNode[];
  routeOffset: ResultMarkerOffset;
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

interface TargetPacketDot {
  key: string;
  color: string | null;
  lost: boolean;
  label: string;
}

interface TargetRouteMetrics {
  latency: string;
  loss: string;
  dots: TargetPacketDot[];
  packetLabel: string;
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
    <LiquidGlassSurface variant="floatingPanel" fullWidth className="results-section-surface">
      <section className="results-section">
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
              <LiquidGlassSurface
                variant="button"
                interactive
                className="result-command-surface"
                onClick={onClose}
                title="关闭结果"
                ariaLabel="关闭结果"
              >
                <Button
                  variant="glass"
                  size="sm"
                  className="result-command-button"
                  asChild
                >
                  <span>
                    <X size={16} />
                    关闭结果
                  </span>
                </Button>
              </LiquidGlassSurface>
            )}
          </div>
        </div>

        <div className="result-metrics" aria-label="trace summary">
          {summary.map((metric) => (
            <LiquidGlassSurface variant="metric" fullWidth className="metric-surface" key={metric.label}>
              <div className="metric">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            </LiquidGlassSurface>
          ))}
          <GeoIpMetric result={result} />
        </div>

        <Tabs className="probe-tabs-root" value={String(activeIndex)} onValueChange={(value) => selectProbe(Number(value))}>
          <LiquidGlassSurface variant="toolbar" fullWidth className="probe-tabs-frame-surface">
            <div className="probe-tabs-frame">
              <TabsList unstyled className="probe-tabs" aria-label="probe results">
                {result.results.map((item, index) => {
                  const targetMetrics = routeTargetMetrics(item);
                  return (
                    <LiquidGlassSurface
                      variant="tab"
                      className={`probe-tab-surface${index === activeIndex ? " is-active" : ""}`}
                      style={routeTabStyle(index)}
                      interactive
                      onClick={() => selectProbe(index)}
                      actionRole="none"
                      key={item.id}
                    >
                      <TabsTrigger unstyled className="probe-tab-button" value={String(index)}>
                        <span className="probe-tab-route-dot" aria-hidden="true" />
                        <span className="probe-tab-copy">
                          <span className="probe-tab-heading">
                            <strong>{item.probe.city || item.probe.country}</strong>
                            <span className="probe-tab-meta">AS{item.probe.asn} · {item.status}</span>
                          </span>
                          <span className="probe-tab-targets">
                            <span className="probe-tab-target" aria-label="目标延迟">
                              <span>延迟</span>
                              <strong>{targetMetrics.latency}</strong>
                            </span>
                            <span className="probe-tab-target" aria-label="目标丢包">
                              <span>丢包</span>
                              <strong>{targetMetrics.loss}</strong>
                            </span>
                          </span>
                          {targetMetrics.dots.length > 0 && (
                            <span className="probe-tab-packets" aria-label={targetMetrics.packetLabel}>
                              {targetMetrics.dots.map((dot) => (
                                <span
                                  className={`probe-tab-packet-dot${dot.lost ? " is-lost" : ""}`}
                                  style={dot.color ? ({ "--packet-color": dot.color } as CSSProperties) : undefined}
                                  title={dot.label}
                                  aria-hidden="true"
                                  key={dot.key}
                                />
                              ))}
                            </span>
                          )}
                        </span>
                      </TabsTrigger>
                    </LiquidGlassSurface>
                  );
                })}
              </TabsList>
            </div>
          </LiquidGlassSurface>
          <TabsContent value={String(activeIndex)} className="probe-tab-content">
            {renderMap && (
              <ResultMap
                data={mapData}
                mapStyleUrl={mapStyleUrl}
                mapProjection={mapProjection}
                selectedRouteNodeId={selectedRouteNodeId}
                mapFocusRequest={mapFocusRequest}
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
    </LiquidGlassSurface>
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
          <LiquidGlassSurface
            variant="tab"
            interactive
            disabled={!onMapProjectionChange && mapProjection !== "mercator"}
            className={`result-view-surface${mapProjection === "mercator" ? " is-active" : ""}`}
            onClick={() => onMapProjectionChange?.("mercator")}
            actionRole="none"
          >
            <Button
              variant="ghost"
              size="sm"
              className="result-view-button"
              type="button"
              aria-pressed={mapProjection === "mercator"}
              aria-label="切换结果地图到 2D"
              disabled={!onMapProjectionChange && mapProjection !== "mercator"}
            >
              <MapIcon size={16} />
              2D
            </Button>
          </LiquidGlassSurface>
          <LiquidGlassSurface
            variant="tab"
            interactive
            disabled={!onMapProjectionChange && mapProjection !== "globe"}
            className={`result-view-surface${mapProjection === "globe" ? " is-active" : ""}`}
            onClick={() => onMapProjectionChange?.("globe")}
            actionRole="none"
          >
            <Button
              variant="ghost"
              size="sm"
              className="result-view-button"
              type="button"
              aria-pressed={mapProjection === "globe"}
              aria-label="切换结果地图到 3D"
              disabled={!onMapProjectionChange && mapProjection !== "globe"}
            >
              <Globe2 size={16} />
              3D
            </Button>
          </LiquidGlassSurface>
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
    <LiquidGlassSurface
      variant="button"
      interactive
      className="result-command-surface"
      onClick={() => {
        void copy();
      }}
      title="分享诊断链接"
    >
      <Button
        variant="glass"
        size="sm"
        className="result-command-button"
        asChild
      >
        <span>
          <Share2 size={16} />
          {copied ? "已复制" : "分享"}
        </span>
      </Button>
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
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const selectedTtls = selectedRouteNodeId ? (mapData.routeNodeById.get(selectedRouteNodeId)?.ttlList ?? []) : [];

  useEffect(() => {
    const firstTtl = selectedTtls[0];
    if (firstTtl === undefined) return;
    rowRefs.current[firstTtl]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    cardRefs.current[firstTtl]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selectedRouteNodeId, selectedTtls]);

  useEffect(() => {
    const tableScroll = tableScrollRef.current;
    if (!tableScroll) return;
    const onWheel = (event: WheelEvent) => handleHopTableWheel(event, tableScroll);
    tableScroll.addEventListener("wheel", onWheel, { passive: false });
    return () => tableScroll.removeEventListener("wheel", onWheel);
  }, []);

  if (!active.hops.length) {
    const failure = active.status === "failed" && active.rawOutput ? `该 probe 失败：${active.rawOutput}` : "该 probe 还没有 hop 数据。";
    return <div className="table-empty">{failure}</div>;
  }

  return (
    <div className="hop-layout">
      <div className="table-scroll hop-table-scroll" ref={tableScrollRef}>
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

function handleHopTableWheel(event: WheelEvent, scrollArea: HTMLElement) {
  if (event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || event.deltaY === 0) return;

  const deltaY = normalizeWheelDeltaY(event, scrollArea);
  const maxScrollTop = scrollArea.scrollHeight - scrollArea.clientHeight;
  const canScrollVertically = maxScrollTop > 1;
  const atTop = scrollArea.scrollTop <= 1;
  const atBottom = scrollArea.scrollTop >= maxScrollTop - 1;
  const shouldDelegate = !canScrollVertically || (deltaY < 0 && atTop) || (deltaY > 0 && atBottom);

  if (!shouldDelegate) return;

  const resultPanel = scrollArea.closest(".glass-overlay-bare-surface, .glass-overlay-body") as HTMLElement | null;
  if (!resultPanel) return;

  const panelMaxScrollTop = resultPanel.scrollHeight - resultPanel.clientHeight;
  if (panelMaxScrollTop <= 1) {
    event.preventDefault();
    return;
  }

  const nextScrollTop = Math.min(panelMaxScrollTop, Math.max(0, resultPanel.scrollTop + deltaY));
  resultPanel.scrollTop = nextScrollTop;
  event.preventDefault();
}

function normalizeWheelDeltaY(event: WheelEvent, scrollArea: HTMLElement): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * scrollArea.clientHeight;
  return event.deltaY;
}

function GeoIpMetric({ result }: { result: TraceResultResponse }) {
  const hasErrors = result.enrichment.errors.length > 0;
  return (
    <LiquidGlassSurface variant="metric" fullWidth className="metric-surface">
      <div className={`metric geoip ${result.enrichment.status}`} aria-label="GeoIP enrichment status">
        <span>GeoIP</span>
        <strong className="geoip-value">
          <b>{enrichmentLabel(result.enrichment.status)}</b>
          <small>
            cache {result.enrichment.cached} · fetch {result.enrichment.fetched}
          </small>
        </strong>
        {hasErrors && <span className="metric-detail notice-text">{enrichmentErrorSummary(result.enrichment.errors)}</span>}
      </div>
    </LiquidGlassSurface>
  );
}

function ResultMap({
  data,
  mapStyleUrl,
  mapProjection,
  selectedRouteNodeId,
  mapFocusRequest,
}: {
  data: ResultMapData;
  mapStyleUrl: string;
  mapProjection: MapProjection;
  selectedRouteNodeId: string | null;
  mapFocusRequest: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dataRef = useRef(data);
  const selectedRouteNodeIdRef = useRef(selectedRouteNodeId);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const routeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const loadedRef = useRef(false);
  const [pinnedGroupId, setPinnedGroupId] = useState<string | null>(null);
  const expandedGroupId = pinnedGroupId;
  dataRef.current = data;
  selectedRouteNodeIdRef.current = selectedRouteNodeId;

  useEffect(() => {
    if (!pinnedGroupId || data.routeGroupById.has(pinnedGroupId)) return;
    setPinnedGroupId(null);
  }, [data, pinnedGroupId]);

  useEffect(() => {
    const node = selectedRouteNodeId ? data.routeNodeById.get(selectedRouteNodeId) : undefined;
    if (!node) return;
    setPinnedGroupId(node.groupSize > 1 ? node.groupId : null);
  }, [data, selectedRouteNodeId]);

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
            "line-width": activeNumberExpression(7.6, 2.8),
            "line-opacity": activeNumberExpression(0.22, 0.04),
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
          "line-width": activeNumberExpression(globeValue(mapProjection, 5.8, 3.2), globeValue(mapProjection, 2.25, 1.45)),
          "line-opacity": activeNumberExpression(globeValue(mapProjection, 0.96, 0.9), globeValue(mapProjection, 0.22, 0.24)),
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
      map.on("click", () => setPinnedGroupId(null));
      if (animatePackets) {
        stopPackets = startPacketAnimation(map, dataRef);
      }
      loadedRef.current = true;
      if (import.meta.env.DEV && containerRef.current) {
        (containerRef.current as ResultMapDebugElement).__globalTraceResultMapReady = true;
      }
      renderResultRouteMarkers({
        map,
        markersRef: routeMarkersRef,
        data: dataRef.current,
        selectedRouteNodeId: selectedRouteNodeIdRef.current,
        expandedGroupId: null,
        popupRef,
        setPinnedGroupId,
      });
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
      clearResultRouteMarkers(routeMarkersRef);
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
    if (!map || !loadedRef.current) return;
    renderResultRouteMarkers({
      map,
      markersRef: routeMarkersRef,
      data,
      selectedRouteNodeId,
      expandedGroupId,
      popupRef,
      setPinnedGroupId,
    });
  }, [data, expandedGroupId, selectedRouteNodeId]);

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
    const routeGroups = buildRouteGroups(routeNodes);
    const routeCoordinates = routeNodes.map((node) => node.coordinate);
    const pathSections = routeCoordinates.length > 0 ? [resultDisplayRouteCoordinates(routeCoordinates)].filter((section) => section.length > 0) : [];
    const displayCoordinates = pathSections.flat();
    const pathSegments = pathSections.flatMap(resultRouteSegments);
    const pathLengthKm = pathSections.reduce((total, section) => total + routeSectionLengthKm(section), 0);
    for (const [sectionIndex, section] of pathSections.entries()) {
      if (section.length <= 1) continue;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: section },
        properties: { kind: "path", routeId, routeIndex: resultIndex, resultId: item.id, sectionIndex, color, lineColor: resultRouteLineColor(color, activeRoute), active: activeRoute },
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
          groupId: node.groupId,
          groupLabel: node.groupLabel,
          groupSize: node.groupSize,
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
      routeGroups,
      routeNodeIdByTtl: buildRouteNodeIdByTtl(routeNodes),
    });
  }

  const routeGroups = routes.flatMap((route) => route.routeGroups);
  assignRouteGroupOffsets(routeGroups);
  const activeRoute = routes.find((route) => route.resultIndex === activeRouteIndex) || null;
  const allRouteNodes = routes.flatMap((route) => route.routeNodes);
  const routeNodeById = new Map(allRouteNodes.map((node) => [node.nodeId, node]));
  const routeGroupById = new Map(routeGroups.map((group) => [group.groupId, group]));

  return {
    featureCollection: { type: "FeatureCollection", features },
    packetFeatureCollection: buildPacketFeatureCollection(routes, 0),
    fitCoordinates: activeRoute?.fitCoordinates || [],
    routes,
    routeNodes: activeRoute?.routeNodes || [],
    routeGroups,
    routeNodeById,
    routeNodeIdByTtl: activeRoute?.routeNodeIdByTtl || new Map(),
    routeGroupById,
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
    groupId: `${route.routeId}-${node.groupId}`,
    routeId: route.routeId,
    resultId: route.resultId,
    resultIndex: route.resultIndex,
    color: route.color,
    active: route.active,
    endpointRole,
    routeOffset: [0, 0] as ResultMarkerOffset,
    popupTitle: `TTL ${node.label}`,
    popupBody: routeNodePopupBody(node.hops),
  };
}

function buildRouteGroups(nodes: ResultRouteNode[]): ResultRouteGroup[] {
  const groups = new Map<string, ResultRouteNode[]>();
  for (const node of nodes) {
    const group = groups.get(node.groupId);
    if (group) {
      group.push(node);
      continue;
    }
    groups.set(node.groupId, [node]);
  }
  return [...groups.entries()].map(([groupId, groupNodes]) => {
    const first = groupNodes[0];
    return {
      groupId,
      routeId: first.routeId,
      resultId: first.resultId,
      resultIndex: first.resultIndex,
      color: first.color,
      active: first.active,
      coordinate: first.coordinate,
      label: first.groupLabel,
      nodeIds: groupNodes.map((node) => node.nodeId),
      nodes: groupNodes,
      routeOffset: [0, 0] as ResultMarkerOffset,
    };
  });
}

function assignRouteGroupOffsets(groups: ResultRouteGroup[]): void {
  const groupsByCoordinate = new Map<string, ResultRouteGroup[]>();
  for (const group of groups) {
    const key = routeGroupCoordinateKey(group.coordinate);
    const coordinateGroups = groupsByCoordinate.get(key);
    if (coordinateGroups) {
      coordinateGroups.push(group);
      continue;
    }
    groupsByCoordinate.set(key, [group]);
  }
  for (const coordinateGroups of groupsByCoordinate.values()) {
    const sortedGroups = coordinateGroups.sort((left, right) => left.resultIndex - right.resultIndex);
    for (const [index, group] of sortedGroups.entries()) {
      const offset: ResultMarkerOffset = sortedGroups.length <= 1 ? [0, 0] : routeGroupOffset(index, sortedGroups.length);
      group.routeOffset = offset;
      for (const node of group.nodes) node.routeOffset = offset;
    }
  }
}

function routeGroupOffset(index: number, count: number): ResultMarkerOffset {
  const angle = -Math.PI / 2 + ((Math.PI * 2) / count) * index;
  return [Math.round(Math.cos(angle) * RESULT_ROUTE_GROUP_OFFSET_PX), Math.round(Math.sin(angle) * RESULT_ROUTE_GROUP_OFFSET_PX)];
}

function routeGroupCoordinateKey(coordinate: ResultMapCoordinate): string {
  return coordinate.map((value) => value.toFixed(6)).join(",");
}

function resultRouteId(index: number): string {
  return `route-${index}`;
}

function resultRouteColor(index: number): string {
  return RESULT_ROUTE_COLORS[index % RESULT_ROUTE_COLORS.length];
}

function resultRouteLineColor(color: string, active: boolean): string {
  return active ? darkenHexColor(color, 0.14) : color;
}

function darkenHexColor(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const factor = Math.max(0, Math.min(1, 1 - amount));
  const components = [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)].map((component) => Number.parseInt(component, 16));
  if (components.some((component) => Number.isNaN(component))) return hex;
  return `#${components.map((component) => Math.round(component * factor).toString(16).padStart(2, "0")).join("")}`;
}

function routeTabStyle(index: number): CSSProperties {
  return { "--route-color": resultRouteColor(index) } as CSSProperties;
}

function routeTargetMetrics(result: TraceProbeResult): TargetRouteMetrics {
  const targetHop = findTargetHop(result);
  if (!targetHop) {
    return { latency: "N/A", loss: "N/A", dots: [], packetLabel: "目标包状态不可用" };
  }

  const latency =
    targetHop.stats && targetHop.stats.loss < 100 && typeof targetHop.stats.avg === "number"
      ? formatMs(targetHop.stats.avg)
      : "N/A";
  const loss = targetHop.stats ? formatPercent(targetHop.stats.loss) : "N/A";
  const total = targetHop.stats?.total;
  const packetTotal = typeof total === "number" && Number.isInteger(total) && total > 0 ? total : targetHop.timingsMs.length;
  const dotCount = Math.min(
    MAX_TRACE_PACKETS,
    Math.max(0, packetTotal),
  );
  const receivedCount = Math.min(
    dotCount,
    Math.max(0, targetHop.stats ? targetHop.stats.rcv : targetHop.timingsMs.length),
  );
  const dots: TargetPacketDot[] = [];
  for (let index = 0; index < dotCount; index += 1) {
    const rtt = index < receivedCount ? targetHop.timingsMs[index] : undefined;
    const hasRtt = typeof rtt === "number" && Number.isFinite(rtt);
    dots.push({
      key: `${targetHop.ttl}-${index}`,
      color: hasRtt ? targetPacketColor(rtt) : null,
      lost: !hasRtt,
      label: hasRtt ? `packet ${index + 1}: ${formatMs(rtt)}` : `packet ${index + 1}: lost`,
    });
  }

  return {
    latency,
    loss,
    dots,
    packetLabel: `目标包状态 ${dotCount} 个，丢包 ${loss}`,
  };
}

function targetPacketColor(rtt: number): string {
  if (rtt <= 60) return "#3b82f6";
  if (rtt <= 150) return "var(--warning)";
  return "var(--danger)";
}

function resultEndpointRole(index: number, count: number): RouteEndpointRole {
  if (count <= 1) return "single";
  if (index === 0) return "start";
  if (index === count - 1) return "end";
  return "middle";
}

function routeColorExpression(): ExpressionSpecification {
  return ["coalesce", ["get", "lineColor"], ["get", "color"], "#587f78"] as ExpressionSpecification;
}

function activeNumberExpression(active: number, inactive: number): ExpressionSpecification {
  return ["case", ["boolean", ["get", "active"], false], active, inactive] as ExpressionSpecification;
}

function renderResultRouteMarkers({
  map,
  markersRef,
  data,
  selectedRouteNodeId,
  expandedGroupId,
  popupRef,
  setPinnedGroupId,
}: {
  map: maplibregl.Map;
  markersRef: MutableRefObject<maplibregl.Marker[]>;
  data: ResultMapData;
  selectedRouteNodeId: string | null;
  expandedGroupId: string | null;
  popupRef: MutableRefObject<maplibregl.Popup | null>;
  setPinnedGroupId: GroupStateSetter;
}): void {
  ensureResultRouteMarkerStyles();
  clearResultRouteMarkers(markersRef);
  for (const group of data.routeGroups) {
    const expanded = expandedGroupId === group.groupId;
    const element = createRouteGroupMarkerElement({
      group,
      selectedRouteNodeId,
      expanded,
      map,
      popupRef,
      setPinnedGroupId,
    });
    const marker = new maplibregl.Marker({
      element,
      offset: group.routeOffset,
      anchor: "center",
      subpixelPositioning: true,
    })
      .setLngLat(group.coordinate)
      .addTo(map);
    markersRef.current.push(marker);
  }
}

function clearResultRouteMarkers(markersRef: MutableRefObject<maplibregl.Marker[]>): void {
  for (const marker of markersRef.current) marker.remove();
  markersRef.current = [];
}

function ensureResultRouteMarkerStyles(): void {
  if (document.getElementById("result-route-marker-styles")) return;
  const style = document.createElement("style");
  style.id = "result-route-marker-styles";
  style.textContent = `
    .result-route-marker .result-route-marker-button {
      opacity: var(--result-route-marker-opacity, 1);
      transition: opacity 120ms ease, transform 120ms ease, box-shadow 120ms ease;
    }
    .result-route-marker:not(.result-route-marker-single) .result-route-marker-node {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
    .result-route-marker:not(.result-route-marker-single):hover .result-route-marker-node,
    .result-route-marker:not(.result-route-marker-single)[data-expanded="true"] .result-route-marker-node {
      opacity: var(--result-route-marker-opacity, 1);
      visibility: visible;
      pointer-events: auto;
    }
    .result-route-marker:hover .result-route-marker-group,
    .result-route-marker[data-expanded="true"] .result-route-marker-group {
      opacity: 0.66;
    }
  `;
  document.head.appendChild(style);
}

function createRouteGroupMarkerElement({
  group,
  selectedRouteNodeId,
  expanded,
  map,
  popupRef,
  setPinnedGroupId,
}: {
  group: ResultRouteGroup;
  selectedRouteNodeId: string | null;
  expanded: boolean;
  map: maplibregl.Map;
  popupRef: MutableRefObject<maplibregl.Popup | null>;
  setPinnedGroupId: GroupStateSetter;
}): HTMLElement {
  const element = document.createElement("div");
  element.className = "result-route-marker";
  element.dataset.routeGroupId = group.groupId;
  if (expanded) element.dataset.expanded = "true";
  element.style.position = "relative";
  element.style.width = "0";
  element.style.height = "0";
  element.style.zIndex = group.active ? (expanded ? "8" : "5") : "2";
  element.style.pointerEvents = "auto";
  element.addEventListener("click", (event) => event.stopPropagation());

  if (group.nodes.length === 1) {
    element.classList.add("result-route-marker-single");
    const node = group.nodes[0];
    element.appendChild(
      createRouteNodeButton({
        node,
        label: node.label,
        selected: selectedRouteNodeId === node.nodeId,
        offset: [0, 0],
        size: 28,
        map,
        popupRef,
        setPinnedGroupId,
      }),
    );
    return element;
  }

  const selected = group.nodeIds.includes(selectedRouteNodeId || "");
  const collapsedButton = createRouteGroupButton(group, selected);
  collapsedButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setPinnedGroupId((value) => (value === group.groupId ? null : group.groupId));
  });
  element.appendChild(collapsedButton);

  for (const [index, node] of group.nodes.entries()) {
    element.appendChild(
      createRouteNodeButton({
        node,
        label: node.label,
        selected: selectedRouteNodeId === node.nodeId,
        offset: fanMarkerOffset(index, group.nodes.length),
        size: 25,
        map,
        popupRef,
        setPinnedGroupId,
      }),
    );
  }

  return element;
}

function createRouteGroupButton(group: ResultRouteGroup, selected: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "result-route-marker-button result-route-marker-group";
  button.dataset.routeGroupId = group.groupId;
  button.setAttribute("aria-label", `展开 TTL ${group.label}`);
  button.textContent = group.label;
  applyRouteMarkerButtonStyle(button, {
    color: group.color,
    active: group.active,
    selected,
    offset: [0, 0],
    size: 32,
  });
  return button;
}

function createRouteNodeButton({
  node,
  label,
  selected,
  offset,
  size,
  map,
  popupRef,
  setPinnedGroupId,
}: {
  node: ResultRouteNode;
  label: string;
  selected: boolean;
  offset: ResultMarkerOffset;
  size: number;
  map: maplibregl.Map;
  popupRef: MutableRefObject<maplibregl.Popup | null>;
  setPinnedGroupId: GroupStateSetter;
}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "result-route-marker-button result-route-marker-node";
  button.dataset.routeNodeId = node.nodeId;
  button.dataset.routeGroupId = node.groupId;
  button.setAttribute("aria-label", `选择 TTL ${node.label}`);
  button.textContent = label;
  applyRouteMarkerButtonStyle(button, { color: node.color, active: node.active, selected, offset, size });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setPinnedGroupId(node.groupSize > 1 ? node.groupId : null);
    showRouteNodePopup(map, node, popupRef);
  });
  return button;
}

function applyRouteMarkerButtonStyle(
  button: HTMLButtonElement,
  {
    color,
    active,
    selected,
    offset,
    size,
  }: {
    color: string;
    active: boolean;
    selected: boolean;
    offset: ResultMarkerOffset;
    size: number;
  },
): void {
  button.style.position = "absolute";
  button.style.left = "0";
  button.style.top = "0";
  button.style.transform = `translate(${offset[0]}px, ${offset[1]}px) translate(-50%, -50%)`;
  button.style.minWidth = `${size}px`;
  button.style.height = `${size}px`;
  button.style.padding = "0 7px";
  button.style.borderRadius = `${size}px`;
  button.style.border = selected ? "2px solid #fde68a" : "1.5px solid rgba(255, 255, 255, 0.88)";
  button.style.background = color;
  button.style.color = "#ffffff";
  button.style.font = "700 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  button.style.textAlign = "center";
  button.style.whiteSpace = "nowrap";
  button.style.cursor = "pointer";
  button.style.setProperty("--result-route-marker-opacity", active ? "1" : "0.48");
  button.style.boxShadow = selected
    ? `0 0 0 4px rgba(253, 230, 138, 0.28), 0 8px 18px rgba(0, 0, 0, 0.36)`
    : `0 0 0 4px ${hexToRgba(color, active ? 0.24 : 0.12)}, 0 7px 16px rgba(0, 0, 0, 0.34)`;
}

function fanMarkerOffset(index: number, count: number): ResultMarkerOffset {
  if (count <= 1) return [0, 0];
  const spread = count === 2 ? 92 : Math.min(250, 58 * (count - 1));
  const start = -90 - spread / 2;
  const step = spread / Math.max(1, count - 1);
  const angle = degreesToRadians(start + step * index);
  return [Math.round(Math.cos(angle) * RESULT_ROUTE_FAN_RADIUS_PX), Math.round(Math.sin(angle) * RESULT_ROUTE_FAN_RADIUS_PX)];
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return `rgba(255, 255, 255, ${alpha})`;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function applySelectedRouteNode(
  map: maplibregl.Map,
  selectedRouteNodeId: string | null,
  data: ResultMapData,
  popupRef: MutableRefObject<maplibregl.Popup | null>,
): void {
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
  const summary = [
    { label: "status", value: result.status },
    { label: "probes", value: `${finished}/${result.probesCount}` },
    { label: "hops", value: String(hopCount) },
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
