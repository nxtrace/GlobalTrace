import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import {
  applyMapPalette,
  applyProbeMarkerPalette,
  MAP_LAND_COLOR,
  MAP_LAND_COLOR_DARK,
  mapPaletteLandColor,
  probeMarkerPaint,
  resolveMapPaletteScheme,
  subscribeMapPaletteScheme,
  transformMapStyle,
} from "./mapPalette";
import { waitFor } from "@testing-library/react";

function createFakeMap(layers: Array<{ id: string; type: string }>) {
  const paint: Array<[string, string, unknown]> = [];
  const layout: Array<[string, string, unknown]> = [];
  const map = {
    getStyle: () => ({ layers }),
    getLayer: (id: string) => layers.find((layer) => layer.id === id),
    setPaintProperty: (id: string, property: string, value: unknown) => {
      paint.push([id, property, value]);
    },
    setLayoutProperty: (id: string, property: string, value: unknown) => {
      layout.push([id, property, value]);
    },
  } as unknown as MapLibreMap;
  return { map, paint, layout };
}

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});

describe("applyMapPalette", () => {
  it("recolors land, water and roads in light mode", () => {
    const { map, paint } = createFakeMap([
      { id: "background", type: "background" },
      { id: "water", type: "fill" },
      { id: "road_minor", type: "line" },
      { id: "road_motorway", type: "line" },
      { id: "road_motorway_casing", type: "line" },
      { id: "label_city", type: "symbol" },
    ]);

    applyMapPalette(map, "light");

    expect(paint).toContainEqual(["background", "background-color", MAP_LAND_COLOR]);
    expect(paint).toContainEqual(["water", "fill-color", "#a8d5f2"]);
    expect(paint).toContainEqual(["road_minor", "line-color", "#ffffff"]);
    expect(paint).toContainEqual(["road_motorway", "line-color", "#f8d49b"]);
    expect(paint).toContainEqual(["road_motorway_casing", "line-color", "#e8b46f"]);
    expect(paint).toContainEqual(["label_city", "text-halo-color", "#ffffff"]);
  });

  it("uses deep gray oceans and clear charcoal land in dark mode", () => {
    const { map, paint } = createFakeMap([
      { id: "background", type: "background" },
      { id: "water", type: "fill" },
      { id: "road_minor", type: "line" },
      { id: "label_city", type: "symbol" },
    ]);

    applyMapPalette(map, "dark");

    expect(paint).toContainEqual(["background", "background-color", MAP_LAND_COLOR_DARK]);
    expect(paint).toContainEqual(["water", "fill-color", "#101012"]);
    expect(paint).toContainEqual(["road_minor", "line-color", "#4a4a50"]);
    expect(paint).toContainEqual(["label_city", "text-color", "#d4d4d8"]);
    expect(paint).toContainEqual(["label_city", "text-halo-color", "#101012"]);
  });

  it("hides the shaded relief raster and skips unknown layers", () => {
    const { map, paint, layout } = createFakeMap([
      { id: "natural_earth", type: "raster" },
      { id: "probe-points", type: "circle" },
    ]);

    applyMapPalette(map, "light");

    expect(layout).toEqual([["natural_earth", "visibility", "none"]]);
    expect(paint).toEqual([]);
  });

  it("transforms style JSON before first paint", () => {
    const style = {
      version: 8,
      sources: {},
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#ffffff" } },
        { id: "water", type: "fill", paint: { "fill-color": "#0000ff" } },
        { id: "natural_earth", type: "raster", layout: { visibility: "visible" } },
      ],
    } as StyleSpecification;

    const next = transformMapStyle(style, "light");
    expect(mapPaletteLandColor("light")).toBe(MAP_LAND_COLOR);
    expect(next.layers[0]).toMatchObject({
      id: "background",
      paint: { "background-color": MAP_LAND_COLOR },
    });
    expect(next.layers[1]).toMatchObject({
      id: "water",
      paint: { "fill-color": "#a8d5f2" },
    });
    expect(next.layers[2]).toMatchObject({
      id: "natural_earth",
      layout: { visibility: "none" },
    });
  });

  it("never applies line paint to symbol layers that share a prefix", () => {
    const { map, paint } = createFakeMap([
      { id: "waterway_river", type: "line" },
      { id: "waterway_line_label", type: "symbol" },
    ]);

    applyMapPalette(map, "light");

    expect(paint).toContainEqual(["waterway_river", "line-color", "#a8d5f2"]);
    expect(paint.filter(([id, property]) => id === "waterway_line_label" && property === "line-color")).toEqual([]);
    expect(paint).toContainEqual(["waterway_line_label", "text-color", "#4a7fa5"]);
  });
});

describe("resolveMapPaletteScheme", () => {
  it("honors explicit theme overrides before the system preference", () => {
    const root = document.createElement("div");
    root.dataset.theme = "dark";
    expect(resolveMapPaletteScheme(root, { matches: false })).toBe("dark");

    root.dataset.theme = "light";
    expect(resolveMapPaletteScheme(root, { matches: true })).toBe("light");

    root.dataset.theme = "system";
    expect(resolveMapPaletteScheme(root, { matches: true })).toBe("dark");
    expect(resolveMapPaletteScheme(root, { matches: false })).toBe("light");
  });
});

describe("subscribeMapPaletteScheme", () => {
  it("notifies when data-theme changes", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    const onChange = vi.fn();
    const unsubscribe = subscribeMapPaletteScheme(onChange);

    document.documentElement.setAttribute("data-theme", "dark");

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("dark"));
    unsubscribe();
  });
});

describe("applyProbeMarkerPalette", () => {
  it("uses slate markers in dark mode and soft blue in light mode", () => {
    expect(probeMarkerPaint("dark").point["circle-color"]).toEqual([
      "case",
      ["==", ["get", "selected"], true],
      "#60a5fa",
      "#8b95a5",
    ]);
    expect(probeMarkerPaint("light").point["circle-color"]).toEqual([
      "case",
      ["==", ["get", "selected"], true],
      "#3b82f6",
      "#bfdbfe",
    ]);

    const { map, paint } = createFakeMap([
      { id: "probe-point-glow", type: "circle" },
      { id: "probe-selected-halo", type: "circle" },
      { id: "probe-points", type: "circle" },
    ]);

    applyProbeMarkerPalette(map, "dark");

    expect(paint).toContainEqual([
      "probe-points",
      "circle-color",
      ["case", ["==", ["get", "selected"], true], "#60a5fa", "#8b95a5"],
    ]);
    expect(paint).toContainEqual([
      "probe-points",
      "circle-stroke-color",
      ["case", ["==", ["get", "selected"], true], "rgba(15, 23, 42, 0.9)", "rgba(18, 18, 22, 0.88)"],
    ]);
  });

  it("skips when probe layers are not present", () => {
    const { map, paint } = createFakeMap([{ id: "background", type: "background" }]);
    applyProbeMarkerPalette(map, "dark");
    expect(paint).toEqual([]);
  });
});
