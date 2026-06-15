import { describe, expect, it } from "vitest";
import type { TraceHop, TraceProbeResult } from "../../shared/types";
import {
  buildPacketFeatureCollection,
  buildResultMapData,
  coordinateBounds,
  resultRouteColor,
} from "./resultMapData";

describe("result map data helpers", () => {
  it("builds active route data with route nodes, features, and TTL lookup", () => {
    const first = traceResult("first", [120, 30], [
      hop(1, 121, 31, "Shanghai"),
      hop(2, 122, 32, "Hangzhou"),
    ]);
    const second = traceResult("second", [-74, 40], [
      hop(1, -73, 41, "New York"),
      hop(2, -72, 42, "Boston"),
    ]);

    const data = buildResultMapData(second, [first, second]);

    expect(data.activeRouteIndex).toBe(1);
    expect(data.activeRouteId).toBe("route-1");
    expect(data.routes).toHaveLength(2);
    expect(data.routes[1]).toMatchObject({
      resultId: "second",
      active: true,
      color: resultRouteColor(1),
    });
    expect(data.routeNodes.map((node) => node.primaryHop.ttl)).toEqual([1, 2]);
    expect(data.routeNodeIdByTtl.get(2)).toBe(data.routeNodes[1].nodeId);
    expect(data.routeNodeById.get(data.routeNodes[0].nodeId)).toBe(data.routeNodes[0]);
    expect(data.fitCoordinates).toContainEqual([-74, 40]);
    expect(data.featureCollection.features.some((feature) => feature.properties?.kind === "probe")).toBe(true);
    expect(data.featureCollection.features.some((feature) => feature.properties?.kind === "path")).toBe(true);
    expect(data.featureCollection.features.some((feature) => feature.properties?.kind === "hop")).toBe(true);
  });

  it("offsets overlapping route groups from different results", () => {
    const first = traceResult("first", [120, 30], [
      hop(1, 130, 35, "Tokyo"),
    ]);
    const second = traceResult("second", [121, 31], [
      hop(1, 130, 35, "Tokyo"),
    ]);

    const data = buildResultMapData(first, [first, second]);
    const groups = data.routeGroups.filter((group) => group.coordinate[0] === 130 && group.coordinate[1] === 35);

    expect(groups).toHaveLength(2);
    expect(groups[0].routeOffset).not.toEqual([0, 0]);
    expect(groups[1].routeOffset).not.toEqual([0, 0]);
    expect(groups[0].routeOffset).not.toEqual(groups[1].routeOffset);
    expect(groups[0].nodes[0].routeOffset).toEqual(groups[0].routeOffset);
    expect(groups[1].nodes[0].routeOffset).toEqual(groups[1].routeOffset);
  });

  it("builds packet features along route sections", () => {
    const result = traceResult("route", [1, 10], [
      hop(1, 0, 10, "A"),
      hop(2, 60, 10, "B"),
    ]);
    const data = buildResultMapData(result, [result]);

    const packetsAtStart = data.packetFeatureCollection.features;
    const packetsLater = buildPacketFeatureCollection(data.routes, 2500).features;

    expect(packetsAtStart.length).toBeGreaterThan(1);
    expect(packetsLater).toHaveLength(packetsAtStart.length);
    expect(packetsAtStart[0].properties).toMatchObject({
      kind: "packet",
      routeId: "route-0",
      resultId: "route",
      active: true,
    });
    expect(packetsLater[0].geometry).not.toEqual(packetsAtStart[0].geometry);
  });

  it("returns coordinate bounds only for finite multi-point extents", () => {
    expect(coordinateBounds([])).toBeNull();
    expect(coordinateBounds([[1, 2]])).toBeNull();
    expect(coordinateBounds([[Number.NaN, 2]])).toBeNull();
    expect(coordinateBounds([
      [10, 5],
      [-3, 12],
      [4, -8],
    ])).toEqual([
      [-3, -8],
      [10, 12],
    ]);
  });
});

function traceResult(
  id: string,
  probeCoordinate: [number, number],
  hops: TraceHop[],
): TraceProbeResult {
  return {
    id,
    probe: {
      continent: "NA",
      region: "Northern America",
      country: "US",
      state: null,
      city: `probe-${id}`,
      asn: 64500,
      latitude: probeCoordinate[1],
      longitude: probeCoordinate[0],
      network: "Example",
      tags: [],
      resolvers: [],
    },
    status: "finished",
    resolvedAddress: "203.0.113.1",
    resolvedHostname: null,
    hops,
    rawOutput: "",
  };
}

function hop(ttl: number, lng: number, lat: number, city: string): TraceHop {
  return {
    ttl,
    ip: `203.0.113.${ttl}`,
    hostname: null,
    asn: [],
    timingsMs: [],
    stats: null,
    geo: {
      ip: `203.0.113.${ttl}`,
      lng,
      lat,
      country: "US",
      city,
    },
  };
}
