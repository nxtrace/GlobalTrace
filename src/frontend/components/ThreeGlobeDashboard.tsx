import { Activity, AlertTriangle, Globe2, Route, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { probeToMagic } from "../../shared/filters";
import type { GlobalpingProbe, TraceHop, TraceProbeResult, TraceResultResponse } from "../../shared/types";
import naturalEarthLines from "../assets/natural-earth-110m-lines.json";
import type { ThemeMode } from "../theme";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";

const GLOBE_RADIUS = 2.8;
const PROBE_RADIUS = 0.038;
const ROUTE_TUBE_RADIUS = 0.012;
const ACTIVE_ROUTE_TUBE_RADIUS = 0.02;
const AUTO_ROTATE_SPEED = 0.0012;
const MAX_VISIBLE_HOPS = 64;
const CLICK_DRAG_THRESHOLD_PX = 6;

type Coordinate = [number, number];

interface NaturalEarthLinesAsset {
  source: string;
  segments: Coordinate[][];
}

interface ThreeGlobeDashboardProps {
  probes: GlobalpingProbe[];
  totalProbes: number;
  probesStatus: "loading" | "ready" | "error";
  selectionNotice: string;
  selectionActive: boolean;
  result: TraceResultResponse | null;
  availableResult: TraceResultResponse | null;
  loading: boolean;
  themeMode: ThemeMode;
  onPickProbe: (probe: GlobalpingProbe) => void;
  onClearSelection: () => void;
  onShowResult: () => void;
  onCloseResult: () => void;
}

interface GlobeDebugElement extends HTMLDivElement {
  __globalTraceThreeProbeCount?: number;
  __globalTraceThreeRouteCount?: number;
  __globalTraceThreeActiveRouteIndex?: number;
  __globalTraceThreeRotationY?: number;
  __globalTraceThreeRendererDisposed?: boolean;
}

interface GlobeRoute {
  id: string;
  resultIndex: number;
  probe: TraceProbeResult["probe"];
  points: GlobeRoutePoint[];
  status: string;
}

interface GlobeRoutePoint {
  coordinate: Coordinate;
  kind: "probe" | "hop";
  ttl?: number;
  hop?: TraceHop;
}

interface GlobePalette {
  background: number;
  ocean: number;
  atmosphere: number;
  boundary: number;
  graticule: number;
  probeEyeball: number;
  probeDatacenter: number;
  probeOther: number;
  activeRoute: number;
  inactiveRoutes: number[];
  selectedHop: number;
  routeNode: number;
  globeEmissiveIntensity: number;
  atmosphereOpacity: number;
  boundaryOpacity: number;
  graticuleOpacity: number;
  probeOpacity: number;
  activeRouteOpacity: number;
  inactiveRouteOpacity: number;
  routeNodeOpacity: number;
}

const earthAsset = naturalEarthLines as NaturalEarthLinesAsset;

export function ThreeGlobeDashboard({
  probes,
  totalProbes,
  probesStatus,
  selectionNotice,
  selectionActive,
  result,
  availableResult,
  loading,
  themeMode,
  onPickProbe,
  onClearSelection,
  onShowResult,
  onCloseResult,
}: ThreeGlobeDashboardProps) {
  const containerRef = useRef<GlobeDebugElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rootGroupRef = useRef<THREE.Group | null>(null);
  const probeGroupRef = useRef<THREE.Group | null>(null);
  const routeGroupRef = useRef<THREE.Group | null>(null);
  const hitProbeMeshesRef = useRef<THREE.Object3D[]>([]);
  const probesRef = useRef(probes);
  const onPickProbeRef = useRef(onPickProbe);
  const hasResultRef = useRef(Boolean(result));
  const interactionRef = useRef({
    hovering: false,
    dragging: false,
    movedBeyondClick: false,
    downX: 0,
    downY: 0,
    lastX: 0,
    lastY: 0,
  });
  const frameRef = useRef<number | null>(null);
  const [renderError, setRenderError] = useState("");
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [selectedHopTtl, setSelectedHopTtl] = useState<number | null>(null);
  const palette = useMemo(() => globePalette(themeMode), [themeMode]);
  const routes = useMemo(() => buildGlobeRoutes(result), [result]);
  const activeRoute = routes[activeRouteIndex] || routes[0] || null;

  probesRef.current = probes;
  onPickProbeRef.current = onPickProbe;
  hasResultRef.current = Boolean(result);

  useEffect(() => {
    setActiveRouteIndex(0);
    setSelectedHopTtl(null);
  }, [result?.measurementId]);

  useEffect(() => {
    if (activeRouteIndex < routes.length) return;
    setActiveRouteIndex(0);
  }, [activeRouteIndex, routes.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || rendererRef.current) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      setRenderError("当前浏览器无法初始化 3D 渲染。");
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(palette.background);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0.55, 8.6);
    const rootGroup = new THREE.Group();
    const probeGroup = new THREE.Group();
    const routeGroup = new THREE.Group();
    rootGroup.rotation.x = -0.2;
    scene.add(rootGroup);
    rootGroup.add(createGlobeMesh(palette));
    rootGroup.add(createBoundaryLines(palette));
    rootGroup.add(createGraticuleLines(palette));
    rootGroup.add(routeGroup);
    rootGroup.add(probeGroup);
    scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(2.5, 3.2, 5);
    scene.add(keyLight);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = "three-globe-canvas";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    cameraRef.current = camera;
    rootGroupRef.current = rootGroup;
    probeGroupRef.current = probeGroup;
    routeGroupRef.current = routeGroup;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(container);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const onPointerDown = (event: PointerEvent) => {
      interactionRef.current.dragging = true;
      interactionRef.current.movedBeyondClick = false;
      interactionRef.current.downX = event.clientX;
      interactionRef.current.downY = event.clientY;
      interactionRef.current.lastX = event.clientX;
      interactionRef.current.lastY = event.clientY;
      renderer.domElement.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction.dragging || !rootGroupRef.current) return;
      const dx = event.clientX - interaction.lastX;
      const dy = event.clientY - interaction.lastY;
      const totalDx = event.clientX - interaction.downX;
      const totalDy = event.clientY - interaction.downY;
      if (Math.hypot(totalDx, totalDy) >= CLICK_DRAG_THRESHOLD_PX) {
        interaction.movedBeyondClick = true;
      }
      interaction.lastX = event.clientX;
      interaction.lastY = event.clientY;
      if (!interaction.movedBeyondClick) return;
      rootGroupRef.current.rotation.y += dx * 0.006;
      rootGroupRef.current.rotation.x = clamp(rootGroupRef.current.rotation.x + dy * 0.004, -0.85, 0.85);
    };
    const finishPointer = (event: PointerEvent, allowPick: boolean) => {
      const interaction = interactionRef.current;
      const shouldPick = interaction.dragging && allowPick && !interaction.movedBeyondClick;
      interaction.dragging = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      if (!shouldPick) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitProbeMeshesRef.current, false)[0]?.object;
      const probeIndex = Number(hit?.userData.probeIndex);
      const probe = probesRef.current[probeIndex];
      if (probe) onPickProbeRef.current(probe);
    };
    const onPointerUp = (event: PointerEvent) => finishPointer(event, true);
    const onPointerCancel = (event: PointerEvent) => finishPointer(event, false);
    const onPointerEnter = () => {
      interactionRef.current.hovering = true;
    };
    const onPointerLeave = () => {
      interactionRef.current.hovering = false;
      interactionRef.current.dragging = false;
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    renderer.domElement.addEventListener("pointerenter", onPointerEnter);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    const animate = () => {
      if (rootGroupRef.current && !interactionRef.current.hovering && !interactionRef.current.dragging && !hasResultRef.current) {
        rootGroupRef.current.rotation.y += AUTO_ROTATE_SPEED;
      }
      if (containerRef.current && rootGroupRef.current && import.meta.env.DEV) {
        containerRef.current.__globalTraceThreeRotationY = rootGroupRef.current.rotation.y;
      }
      renderer.render(scene, camera);
      frameRef.current = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      resizeObserver?.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("pointerenter", onPointerEnter);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      container.__globalTraceThreeRendererDisposed = true;
      rendererRef.current = null;
      cameraRef.current = null;
      rootGroupRef.current = null;
      probeGroupRef.current = null;
      routeGroupRef.current = null;
      hitProbeMeshesRef.current = [];
    };
  }, [palette]);

  useEffect(() => {
    const probeGroup = probeGroupRef.current;
    const routeGroup = routeGroupRef.current;
    if (!probeGroup || !routeGroup) return;
    clearGroup(probeGroup);
    clearGroup(routeGroup);
    hitProbeMeshesRef.current = [];
    for (const child of createProbeMeshes(probes, palette)) {
      probeGroup.add(child);
      hitProbeMeshesRef.current.push(child);
    }
    for (const child of createRouteMeshes(routes, activeRouteIndex, selectedHopTtl, palette)) {
      routeGroup.add(child);
    }
    if (containerRef.current) {
      containerRef.current.__globalTraceThreeProbeCount = probes.length;
      containerRef.current.__globalTraceThreeRouteCount = routes.length;
      containerRef.current.__globalTraceThreeActiveRouteIndex = activeRouteIndex;
    }
  }, [activeRouteIndex, palette, probes, routes, selectedHopTtl]);

  const selectRoute = (index: number) => {
    setActiveRouteIndex(index);
    setSelectedHopTtl(null);
  };

  return (
    <Surface asChild className="three-dashboard" aria-label="3D 地球视图">
      <section>
        <div className="three-globe-stage" ref={containerRef} data-testid="three-globe-stage">
          {renderError && (
            <div className="three-render-error" role="alert">
              <AlertTriangle size={18} />
              {renderError}
            </div>
          )}
          <div className="three-globe-source">
            <Globe2 size={16} />
            <span>Globalping × NextTrace</span>
          </div>
          <div className="three-globe-status">
            <strong>{globeStatusText(probesStatus, probes.length, totalProbes)}</strong>
            <span>{selectionNotice || "点选 3D 节点生成 magic probe 筛选"}</span>
          </div>
          {selectionActive && (
            <Button
              variant="glass"
              size="sm"
              type="button"
              className="three-clear-selection"
              onClick={onClearSelection}
              aria-label="取消 3D 地图筛选"
            >
              <X size={16} />
              取消筛选
            </Button>
          )}
        </div>

        <aside className="three-dashboard-panel" aria-label="3D trace summary">
          <div className="three-panel-header">
            <div>
              <h2>全球路由跟踪</h2>
              <p>GLOBALPING × NEXTTRACE</p>
            </div>
            {result && (
              <Button variant="ghost" size="sm" type="button" onClick={onCloseResult} aria-label="关闭 3D 结果">
                <X size={16} />
                关闭
              </Button>
            )}
          </div>

          {result ? (
            <div className="three-result-content">
              <div className="three-result-metrics" aria-label="3D trace metrics">
                <Metric label="target" value={result.target} />
                <Metric label="routes" value={`${routes.length}/${result.probesCount}`} />
                <Metric label="GeoIP" value={enrichmentLabel(result.enrichment.status)} />
              </div>

              <div className="three-route-cards" aria-label="3D probe routes">
                {result.results.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={index === activeRouteIndex ? "three-route-card active" : "three-route-card"}
                    onClick={() => selectRoute(index)}
                  >
                    <strong>{item.probe.city || item.probe.country || `probe ${index + 1}`}</strong>
                    <span>
                      {item.probe.country} · AS{item.probe.asn} · {item.hops.length} hops · {item.status}
                    </span>
                    <small>{routeLatencyLabel(item)}</small>
                  </button>
                ))}
              </div>

              {activeRoute ? (
                <div className="three-hop-list" aria-label="3D active route hops">
                  {activeRoute.points.filter((point) => point.kind === "hop" && point.hop).slice(0, MAX_VISIBLE_HOPS).map((point) => (
                    <button
                      key={`${activeRoute.id}-${point.ttl}`}
                      type="button"
                      className={selectedHopTtl === point.ttl ? "three-hop-row active" : "three-hop-row"}
                      onClick={() => setSelectedHopTtl(point.ttl ?? null)}
                    >
                      <span>TTL {point.ttl}</span>
                      <strong>{point.hop?.ip || "*"}</strong>
                      <small>{hopMeta(point.hop)}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="three-panel-empty">
                  <Route size={18} />
                  该结果没有可绘制的 hop GeoIP。
                </div>
              )}
            </div>
          ) : (
            <div className="three-panel-empty">
              <Activity size={18} />
              <strong>{loading ? "正在读取 measurement" : "等待网络路径诊断"}</strong>
              <span>用左侧面板设置目标和 probe 筛选后开始诊断。</span>
              {availableResult && (
                <Button variant="glass" size="sm" type="button" onClick={onShowResult} aria-label="查看 3D 结果">
                  查看结果
                </Button>
              )}
              <div className="three-probe-summary">
                <Badge variant="accent">{probes.length} visible</Badge>
                <Badge variant="muted">{totalProbes} total</Badge>
              </div>
            </div>
          )}
        </aside>
      </section>
    </Surface>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="three-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function buildGlobeRoutes(result: TraceResultResponse | null): GlobeRoute[] {
  if (!result) return [];
  return result.results.map((item, index) => {
    const points: GlobeRoutePoint[] = [];
    if (validCoordinate(item.probe.longitude, item.probe.latitude)) {
      points.push({ coordinate: [item.probe.longitude, item.probe.latitude], kind: "probe" });
    }
    for (const hop of item.hops) {
      if (!validCoordinate(hop.geo?.lng, hop.geo?.lat)) continue;
      points.push({ coordinate: [hop.geo?.lng as number, hop.geo?.lat as number], kind: "hop", ttl: hop.ttl, hop });
    }
    return {
      id: item.id || `route-${index}`,
      resultIndex: index,
      probe: item.probe,
      status: item.status,
      points,
    };
  });
}

export function latLngToVector(lng: number, lat: number, radius = GLOBE_RADIUS): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function createGlobeMesh(palette: GlobePalette): THREE.Object3D {
  const group = new THREE.Group();
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64),
    new THREE.MeshStandardMaterial({
      color: palette.ocean,
      metalness: 0.08,
      roughness: 0.74,
      emissive: palette.ocean,
      emissiveIntensity: palette.globeEmissiveIntensity,
    }),
  );
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS * 1.012, 96, 64),
    new THREE.MeshBasicMaterial({
      color: palette.atmosphere,
      transparent: true,
      opacity: palette.atmosphereOpacity,
      side: THREE.BackSide,
    }),
  );
  group.add(globe, atmosphere);
  return group;
}

function createBoundaryLines(palette: GlobePalette): THREE.Object3D {
  const positions: number[] = [];
  for (const segment of earthAsset.segments) {
    for (let index = 1; index < segment.length; index += 1) {
      pushLineSegment(positions, segment[index - 1], segment[index], GLOBE_RADIUS * 1.004);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: palette.boundary, transparent: true, opacity: palette.boundaryOpacity }),
  );
}

function createGraticuleLines(palette: GlobePalette): THREE.Object3D {
  const positions: number[] = [];
  for (let lng = -180; lng <= 180; lng += 30) {
    const points: Coordinate[] = [];
    for (let lat = -75; lat <= 75; lat += 5) points.push([lng, lat]);
    pushPolylineSegments(positions, points, GLOBE_RADIUS * 1.006);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const points: Coordinate[] = [];
    for (let lng = -180; lng <= 180; lng += 5) points.push([lng, lat]);
    pushPolylineSegments(positions, points, GLOBE_RADIUS * 1.006);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: palette.graticule, transparent: true, opacity: palette.graticuleOpacity }),
  );
}

function createProbeMeshes(probes: GlobalpingProbe[], palette: GlobePalette): THREE.Object3D[] {
  return probes.flatMap((probe, index) => {
    if (!validCoordinate(probe.location.longitude, probe.location.latitude)) return [];
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(PROBE_RADIUS, 14, 10),
      new THREE.MeshBasicMaterial({ color: probeColor(probe, palette), transparent: true, opacity: palette.probeOpacity }),
    );
    mesh.position.copy(latLngToVector(probe.location.longitude, probe.location.latitude, GLOBE_RADIUS * 1.04));
    mesh.userData.probeIndex = index;
    mesh.userData.magic = probeToMagic(probe);
    return [mesh];
  });
}

function createRouteMeshes(
  routes: GlobeRoute[],
  activeRouteIndex: number,
  selectedHopTtl: number | null,
  palette: GlobePalette,
): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  routes.forEach((route, index) => {
    if (route.points.length < 2) return;
    const active = index === activeRouteIndex;
    const color = active ? palette.activeRoute : palette.inactiveRoutes[index % palette.inactiveRoutes.length];
    for (let pointIndex = 1; pointIndex < route.points.length; pointIndex += 1) {
      const curvePoints = arcPoints(route.points[pointIndex - 1].coordinate, route.points[pointIndex].coordinate, active);
      const geometry = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(curvePoints),
        active ? 36 : 24,
        active ? ACTIVE_ROUTE_TUBE_RADIUS : ROUTE_TUBE_RADIUS,
        7,
        false,
      );
      objects.push(new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: active ? palette.activeRouteOpacity : palette.inactiveRouteOpacity,
        }),
      ));
    }
    if (!active) return;
    for (const point of route.points) {
      const selected = point.kind === "hop" && point.ttl === selectedHopTtl;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(selected ? 0.07 : 0.048, 16, 12),
        new THREE.MeshBasicMaterial({
          color: selected ? palette.selectedHop : palette.routeNode,
          transparent: true,
          opacity: palette.routeNodeOpacity,
        }),
      );
      mesh.position.copy(latLngToVector(point.coordinate[0], point.coordinate[1], GLOBE_RADIUS * 1.055));
      objects.push(mesh);
    }
  });
  return objects;
}

function arcPoints(start: Coordinate, end: Coordinate, active: boolean): THREE.Vector3[] {
  const startVector = latLngToVector(start[0], start[1], 1).normalize();
  const endVector = latLngToVector(end[0], end[1], 1).normalize();
  const angle = startVector.angleTo(endVector);
  const lift = (active ? 0.72 : 0.5) + Math.min(angle, Math.PI) * 0.22;
  const steps = active ? 32 : 22;
  const points: THREE.Vector3[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const vector = startVector.clone().lerp(endVector, t).normalize();
    const height = GLOBE_RADIUS + Math.sin(Math.PI * t) * lift + 0.08;
    points.push(vector.multiplyScalar(height));
  }
  return points;
}

function pushPolylineSegments(positions: number[], points: Coordinate[], radius: number): void {
  for (let index = 1; index < points.length; index += 1) {
    pushLineSegment(positions, points[index - 1], points[index], radius);
  }
}

function pushLineSegment(positions: number[], start: Coordinate, end: Coordinate, radius: number): void {
  const startVector = latLngToVector(start[0], start[1], radius);
  const endVector = latLngToVector(end[0], end[1], radius);
  positions.push(startVector.x, startVector.y, startVector.z, endVector.x, endVector.y, endVector.z);
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
}

function disposeObject(object: THREE.Object3D): void {
  for (const child of [...object.children]) disposeObject(child);
  const maybeMesh = object as THREE.Object3D & { geometry?: { dispose?: () => void }; material?: unknown };
  maybeMesh.geometry?.dispose?.();
  const materials = Array.isArray(maybeMesh.material) ? maybeMesh.material : [maybeMesh.material];
  for (const material of materials) {
    if (material && typeof material === "object" && "dispose" in material) {
      (material as { dispose: () => void }).dispose();
    }
  }
}

function probeColor(probe: GlobalpingProbe, palette: GlobePalette): number {
  const tags = probe.tags.map((tag) => tag.toLowerCase());
  if (tags.includes("eyeball-network")) return palette.probeEyeball;
  if (tags.includes("datacenter-network")) return palette.probeDatacenter;
  return palette.probeOther;
}

export function globePalette(themeMode: ThemeMode): GlobePalette {
  const dark = themeMode === "dark" || (themeMode === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  return dark
    ? {
        background: 0x050a12,
        ocean: 0x071522,
        atmosphere: 0x5aa9ff,
        boundary: 0x5e6f80,
        graticule: 0x243549,
        probeEyeball: 0x31e6cc,
        probeDatacenter: 0xf2bd45,
        probeOther: 0x69a7ff,
        activeRoute: 0x29e6cf,
        inactiveRoutes: [0x8b6cf6, 0x38bdf8, 0xf6c044, 0x1dd3a6],
        selectedHop: 0xffcf4a,
        routeNode: 0xe6edf3,
        globeEmissiveIntensity: 0.05,
        atmosphereOpacity: 0.18,
        boundaryOpacity: 0.24,
        graticuleOpacity: 0.09,
        probeOpacity: 0.96,
        activeRouteOpacity: 0.86,
        inactiveRouteOpacity: 0.16,
        routeNodeOpacity: 0.94,
      }
    : {
        background: 0xf5f8fb,
        ocean: 0xdceaf1,
        atmosphere: 0x79a6bf,
        boundary: 0x6f7f8b,
        graticule: 0xa9b8c2,
        probeEyeball: 0x008f8b,
        probeDatacenter: 0xd59013,
        probeOther: 0x2f6db5,
        activeRoute: 0x009e9a,
        inactiveRoutes: [0x4276d8, 0x7a5bd6, 0xd28a10, 0x16a77f],
        selectedHop: 0xc98300,
        routeNode: 0x1f2a36,
        globeEmissiveIntensity: 0.08,
        atmosphereOpacity: 0.16,
        boundaryOpacity: 0.38,
        graticuleOpacity: 0.16,
        probeOpacity: 0.9,
        activeRouteOpacity: 0.88,
        inactiveRouteOpacity: 0.24,
        routeNodeOpacity: 0.92,
      };
}

function validCoordinate(lng: unknown, lat: unknown): boolean {
  return (
    typeof lng === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90 &&
    !(lng === 0 && lat === 0)
  );
}

function routeLatencyLabel(item: TraceProbeResult): string {
  const averages = item.hops.map((hop) => hop.stats?.avg).filter((value): value is number => typeof value === "number");
  if (!averages.length) return "latency -";
  const average = averages.reduce((sum, value) => sum + value, 0) / averages.length;
  return `avg ${average.toFixed(1)} ms`;
}

function hopMeta(hop: TraceHop | undefined): string {
  if (!hop) return "-";
  const parts = [
    hop.asn.length ? hop.asn.map((asn) => `AS${asn}`).join(", ") : "",
    [hop.geo?.city || hop.geo?.city_en, hop.geo?.country || hop.geo?.country_en].filter(Boolean).join(", "),
    hop.stats?.avg === null || hop.stats?.avg === undefined ? "" : `${hop.stats.avg.toFixed(1)} ms`,
  ].filter(Boolean);
  return parts.join(" · ") || "-";
}

function enrichmentLabel(status: TraceResultResponse["enrichment"]["status"]): string {
  if (status === "complete") return "完成";
  if (status === "partial") return "部分完成";
  return "跳过";
}

function globeStatusText(status: "loading" | "ready" | "error", visible: number, total: number): string {
  if (status === "loading") return "probes 加载中";
  if (status === "error") return "probes 读取失败";
  return `${visible} / ${total} probes`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
