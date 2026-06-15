import type { Feature, FeatureCollection } from "geojson";
import type { TraceHop, TraceProbeResult } from "../../shared/types";
import {
  buildRouteNodeIdByTtl,
  buildRouteNodesForHops,
  nearestWorldCoordinate,
  validMapCoordinate,
  type ResultRouteCoordinate,
  type ResultRouteNode as SharedResultRouteNode,
} from "./resultRouteNodes";

const RESULT_ROUTE_COLORS = ["#14b8a6", "#f97316", "#8b5cf6", "#22c55e", "#0ea5e9", "#e11d48", "#facc15", "#06b6d4", "#a855f7", "#84cc16"];
const RESULT_PACKET_SPACING_KM = 1800;
const RESULT_PACKET_SPEED_KM_PER_SECOND = 900;
const RESULT_ROUTE_DISPLAY_SEGMENT_KM = 350;
const RESULT_ROUTE_GROUP_OFFSET_PX = 15;
const EARTH_RADIUS_KM = 6371.0088;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;

export type ResultMapCoordinate = ResultRouteCoordinate;
export type RouteEndpointRole = "start" | "end" | "single" | "middle";
export type ResultMarkerOffset = [number, number];

export interface ResultMapData {
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

export interface ResultMapRoute {
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

export interface ResultRouteSegment {
  start: ResultMapCoordinate;
  end: ResultMapCoordinate;
  startKm: number;
  endKm: number;
}

export interface ResultRouteNode extends SharedResultRouteNode {
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

export interface ResultRouteGroup {
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

export function resultRouteColor(index: number): string {
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

function resultEndpointRole(index: number, count: number): RouteEndpointRole {
  if (count <= 1) return "single";
  if (index === 0) return "start";
  if (index === count - 1) return "end";
  return "middle";
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

export function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
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

export function coordinateBounds(coordinates: ResultMapCoordinate[]): [ResultMapCoordinate, ResultMapCoordinate] | null {
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

function displayHostname(hostname: string | null, ip: string): string | null {
  const next = hostname?.trim();
  if (!next || next === "-" || next === ip) return null;
  return next;
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
