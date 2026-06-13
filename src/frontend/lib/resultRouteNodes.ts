import type { NxtraceGeo, TraceHop } from "../../shared/types";

const COORDINATE_EQUALITY_EPSILON = 1e-6;
const EARTH_RADIUS_KM = 6371.0088;

export type ResultRouteCoordinate = [number, number];

export interface RouteNode {
  coordinate: ResultRouteCoordinate;
  hops: TraceHop[];
}

export interface ResultRouteNode extends RouteNode {
  nodeId: string;
  ttlList: number[];
  label: string;
  primaryHop: TraceHop;
}

interface BuildRouteNodesOptions {
  mergeDistanceKm?: number;
}

export function buildRouteNodesForHops(hops: TraceHop[], options: BuildRouteNodesOptions = {}): ResultRouteNode[] {
  return routeNodesForHops(hops, options).map((node, index) => routeNodeMetadata(node, index));
}

export function buildRouteNodeIdByTtl(routeNodes: ResultRouteNode[]): Map<number, string> {
  const routeNodeIdByTtl = new Map<number, string>();
  for (const node of routeNodes) {
    for (const ttl of node.ttlList) routeNodeIdByTtl.set(ttl, node.nodeId);
  }
  return routeNodeIdByTtl;
}

export function validMapCoordinate(lng: unknown, lat: unknown): boolean {
  if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return false;
  return !(lng === 0 && lat === 0);
}

export function nearestWorldCoordinate(coordinate: ResultRouteCoordinate, reference: ResultRouteCoordinate): ResultRouteCoordinate {
  const [lng, lat] = coordinate;
  let nearest = lng;
  for (const candidate of [lng - 720, lng - 360, lng, lng + 360, lng + 720]) {
    if (Math.abs(candidate - reference[0]) < Math.abs(nearest - reference[0])) {
      nearest = candidate;
    }
  }
  return [nearest, lat];
}

function routeNodesForHops(hops: TraceHop[], options: BuildRouteNodesOptions): RouteNode[] {
  const nodes: RouteNode[] = [];
  for (const hop of hops) {
    if (!hopDrawableGeo(hop.geo)) continue;
    const previous = nodes.at(-1)?.coordinate;
    const coordinate = normalizeNextCoordinate([hop.geo.lng, hop.geo.lat], previous);
    const last = nodes.at(-1);
    if (last && shouldMergeRouteNode(last, hop, coordinate, options.mergeDistanceKm)) {
      last.hops.push(hop);
      continue;
    }
    nodes.push({ coordinate, hops: [hop] });
  }
  return nodes;
}

function routeNodeMetadata(node: RouteNode, index: number): ResultRouteNode {
  const ttlList = ttlListForHops(node.hops);
  const label = routeNodeLabel(ttlList);
  const primaryHop = node.hops[0];
  return {
    ...node,
    nodeId: `route-node-${ttlList.join("-") || index}`,
    ttlList,
    label,
    primaryHop,
  };
}

function hopDrawableGeo(geo: NxtraceGeo | undefined): geo is NxtraceGeo & { lng: number; lat: number } {
  return validMapCoordinate(geo?.lng, geo?.lat) && !coarseCountryGeo(geo);
}

function coarseCountryGeo(geo: NxtraceGeo | undefined): boolean {
  const country = normalizeCountry(geo?.country_en || geo?.country);
  if (!["china", "中国", "united states", "united states of america", "美国", "russia", "russian federation", "俄罗斯"].includes(country)) {
    return false;
  }
  return ![geo?.prov, geo?.prov_en, geo?.city, geo?.city_en].some((value) => value?.trim());
}

function normalizeCountry(value: string | undefined): string {
  return value?.trim().toLowerCase() || "";
}

function normalizeNextCoordinate(coordinate: ResultRouteCoordinate, previous: ResultRouteCoordinate | undefined): ResultRouteCoordinate {
  if (!previous) return coordinate;
  let [lng] = coordinate;
  const [, lat] = coordinate;
  while (lng - previous[0] >= 180) lng -= 360;
  while (lng - previous[0] < -180) lng += 360;
  return [lng, lat];
}

function shouldMergeCoordinates(left: ResultRouteCoordinate, right: ResultRouteCoordinate, mergeDistanceKm: number | undefined): boolean {
  if (sameCoordinate(left, right)) return true;
  return typeof mergeDistanceKm === "number" && mergeDistanceKm > 0 && coordinateDistanceKm(left, right) <= mergeDistanceKm;
}

function shouldMergeRouteNode(
  previous: RouteNode,
  hop: TraceHop,
  coordinate: ResultRouteCoordinate,
  mergeDistanceKm: number | undefined,
): boolean {
  const previousHop = previous.hops.at(-1);
  return Boolean(previousHop && hop.ttl === previousHop.ttl + 1 && shouldMergeCoordinates(previous.coordinate, coordinate, mergeDistanceKm));
}

function sameCoordinate(left: ResultRouteCoordinate, right: ResultRouteCoordinate): boolean {
  return Math.abs(left[0] - right[0]) <= COORDINATE_EQUALITY_EPSILON && Math.abs(left[1] - right[1]) <= COORDINATE_EQUALITY_EPSILON;
}

function coordinateDistanceKm(left: ResultRouteCoordinate, right: ResultRouteCoordinate): number {
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

function ttlListForHops(hops: TraceHop[]): number[] {
  return [...new Set(hops.map((hop) => hop.ttl).filter(Number.isFinite))];
}

function routeNodeLabel(ttls: number[]): string {
  if (ttls.length === 0) return "?";
  if (ttls.length === 1) return String(ttls[0]);
  const contiguous = ttls.every((ttl, index) => index === 0 || ttl === ttls[index - 1] + 1);
  return contiguous ? `${ttls[0]}-${ttls.at(-1)}` : `${ttls[0]}+`;
}
