import { describe, expect, it } from "vitest";
import type { TraceHop } from "../../shared/types";
import {
  buildRouteNodeIdByTtl,
  buildRouteNodesForHops,
  nearestWorldCoordinate,
  validMapCoordinate,
} from "./resultRouteNodes";

describe("result route node helpers", () => {
  it("groups hops that share the same drawable coordinate", () => {
    const nodes = buildRouteNodesForHops([
      hop(1, { lng: 120.1, lat: 30.2, city: "Shanghai" }),
      hop(2, { lng: 120.1, lat: 30.2, city: "Shanghai" }),
      hop(4, { lng: 139.7, lat: 35.6, city: "Tokyo" }),
    ]);

    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toMatchObject({
      label: "1",
      groupLabel: "1-2",
      groupSize: 2,
      groupIndex: 0,
    });
    expect(nodes[1]).toMatchObject({
      label: "2",
      groupLabel: "1-2",
      groupSize: 2,
      groupIndex: 1,
    });
    expect(nodes[2]).toMatchObject({
      label: "4",
      groupLabel: "4",
      groupSize: 1,
      groupIndex: 0,
    });
  });

  it("normalizes longitudes across the antimeridian", () => {
    const nodes = buildRouteNodesForHops([
      hop(1, { lng: 170, lat: 10, city: "Suva" }),
      hop(2, { lng: -170, lat: 12, city: "Apia" }),
      hop(3, { lng: 175, lat: 14, city: "Nadi" }),
    ]);

    expect(nodes.map((node) => node.coordinate[0])).toEqual([170, 190, 175]);
  });

  it("filters invalid and country-only coarse geolocation", () => {
    const nodes = buildRouteNodesForHops([
      hop(1, { lng: 0, lat: 0, city: "Null Island" }),
      hop(2, { lng: 116.4, lat: 39.9, country_en: "China" }),
      hop(3, { lng: 116.4, lat: 39.9, country_en: "China", prov_en: "Beijing" }),
      hop(4, { lng: -95.7, lat: 37.1, country_en: "United States" }),
      hop(5, { lng: -97.7, lat: 30.2, country_en: "United States", city_en: "Austin" }),
    ]);

    expect(nodes.map((node) => node.primaryHop.ttl)).toEqual([3, 5]);
  });

  it("maps every finite TTL to its route node id", () => {
    const nodes = buildRouteNodesForHops([
      hop(1, { lng: 1, lat: 1, city: "One" }),
      hop(2, { lng: 2, lat: 2, city: "Two" }),
    ]);

    expect(buildRouteNodeIdByTtl(nodes)).toEqual(
      new Map([
        [1, nodes[0].nodeId],
        [2, nodes[1].nodeId],
      ]),
    );
  });

  it("validates map coordinates and picks the nearest wrapped world", () => {
    expect(validMapCoordinate(120, 30)).toBe(true);
    expect(validMapCoordinate(0, 0)).toBe(false);
    expect(validMapCoordinate("120", 30)).toBe(false);
    expect(validMapCoordinate(181, 30)).toBe(false);
    expect(validMapCoordinate(120, 91)).toBe(false);

    expect(nearestWorldCoordinate([-170, 35], [170, 35])).toEqual([190, 35]);
    expect(nearestWorldCoordinate([170, 35], [-170, 35])).toEqual([-190, 35]);
  });
});

function hop(
  ttl: number,
  geo: Partial<NonNullable<TraceHop["geo"]>> & Pick<NonNullable<TraceHop["geo"]>, "lng" | "lat">,
): TraceHop {
  return {
    ttl,
    ip: `203.0.113.${ttl}`,
    hostname: null,
    asn: [],
    timingsMs: [],
    stats: null,
    geo: { ip: `203.0.113.${ttl}`, ...geo },
  };
}
