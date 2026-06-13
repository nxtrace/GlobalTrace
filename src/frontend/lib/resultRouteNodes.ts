import type { NxtraceGeo, TraceHop } from "../../shared/types";

const COORDINATE_EQUALITY_EPSILON = 1e-6;

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
  groupId: string;
  groupLabel: string;
  groupSize: number;
  groupIndex: number;
}

export function buildRouteNodesForHops(hops: TraceHop[]): ResultRouteNode[] {
  return routeNodeMetadata(routeNodesForHops(hops));
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

function routeNodesForHops(hops: TraceHop[]): RouteNode[] {
  const nodes: RouteNode[] = [];
  for (const hop of hops) {
    if (!hopDrawableGeo(hop.geo)) continue;
    const previous = nodes.at(-1)?.coordinate;
    const coordinate = normalizeNextCoordinate([hop.geo.lng, hop.geo.lat], previous);
    nodes.push({ coordinate, hops: [hop] });
  }
  return nodes;
}

function routeNodeMetadata(nodes: RouteNode[]): ResultRouteNode[] {
  const groups = routeNodeGroups(nodes);
  return nodes.map((node, index) => {
    const ttlList = ttlListForHops(node.hops);
    const label = routeNodeLabel(ttlList);
    const primaryHop = node.hops[0];
    const group = groups.get(coordinateKey(node.coordinate));
    const groupTtls = group?.flatMap((item) => ttlListForHops(item.hops)) || ttlList;
    const groupIndex = group?.indexOf(node) ?? 0;
    return {
      ...node,
      nodeId: `route-node-${ttlList.join("-") || index}`,
      ttlList,
      label,
      primaryHop,
      groupId: `route-node-group-${groupTtls.join("-") || index}`,
      groupLabel: routeNodeLabel(groupTtls),
      groupSize: group?.length || 1,
      groupIndex,
    };
  });
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

function routeNodeGroups(nodes: RouteNode[]): Map<string, RouteNode[]> {
  const groups = new Map<string, RouteNode[]>();
  for (const node of nodes) {
    const key = coordinateKey(node.coordinate);
    const group = groups.get(key);
    if (group) {
      group.push(node);
      continue;
    }
    groups.set(key, [node]);
  }
  return groups;
}

function coordinateKey(coordinate: ResultRouteCoordinate): string {
  return coordinate.map((value) => String(Math.round(value / COORDINATE_EQUALITY_EPSILON))).join(",");
}

function ttlListForHops(hops: TraceHop[]): number[] {
  return [...new Set(hops.map((hop) => hop.ttl).filter(Number.isFinite))];
}

function routeNodeLabel(ttls: number[]): string {
  if (ttls.length === 0) return "?";
  if (ttls.length === 1) return String(ttls[0]);
  const sortedTtls = [...new Set(ttls)].sort((left, right) => left - right);
  const ranges: string[] = [];
  let start = sortedTtls[0];
  let previous = start;
  for (const ttl of sortedTtls.slice(1)) {
    if (ttl === previous + 1) {
      previous = ttl;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = ttl;
    previous = ttl;
  }
  ranges.push(start === previous ? String(start) : `${start}-${previous}`);
  return ranges.join("/");
}
