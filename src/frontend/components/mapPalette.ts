import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

export type MapPaletteScheme = "light" | "dark";

/**
 * Apple Maps style palettes applied on top of the OpenMapTiles/Liberty layer set.
 * Light: warm off-white land and soft blue water.
 * Dark: clear charcoal land with deeper gray oceans — no murky CSS wash.
 */
export const MAP_LAND_COLOR = "#f7f5f0";
export const MAP_LAND_COLOR_DARK = "#2c2c30";

interface PaletteColors {
  land: string;
  water: string;
  park: string;
  parkOutline: string;
  wood: string;
  grass: string;
  wetland: string;
  sand: string;
  ice: string;
  residential: string;
  landuseSoft: string;
  aeroway: string;
  building: string;
  building3d: string;
  road: string;
  roadCasing: string;
  path: string;
  motorway: string;
  motorwayCasing: string;
  rail: string;
  boundary: string;
  labelHalo: string;
  placeLabel: string;
  roadLabel: string;
  poiLabel: string;
  waterLabel: string;
}

const LIGHT: PaletteColors = {
  land: MAP_LAND_COLOR,
  water: "#a8d5f2",
  park: "#d7eacd",
  parkOutline: "#c3dcb7",
  wood: "#cde3c4",
  grass: "#dcecd0",
  wetland: "#d5e6df",
  sand: "#f3ead4",
  ice: "#eef4f8",
  residential: "#f1eee8",
  landuseSoft: "#efece4",
  aeroway: "#ebe7df",
  building: "#e9e5dd",
  building3d: "#e4e0d7",
  road: "#ffffff",
  roadCasing: "#e3ded4",
  path: "#e7e2d8",
  motorway: "#f8d49b",
  motorwayCasing: "#e8b46f",
  rail: "#dcd6cb",
  boundary: "#c6c0b4",
  labelHalo: "#ffffff",
  placeLabel: "#57534c",
  roadLabel: "#6b665e",
  poiLabel: "#7c766c",
  waterLabel: "#4a7fa5",
};

/** Clear dark palette: ocean is deep gray, land stays lighter for crisp contrast. */
const DARK: PaletteColors = {
  land: MAP_LAND_COLOR_DARK,
  water: "#101012",
  park: "#243028",
  parkOutline: "#314038",
  wood: "#222e28",
  grass: "#28342c",
  wetland: "#222c30",
  sand: "#322e26",
  ice: "#282c34",
  residential: "#303034",
  landuseSoft: "#303034",
  aeroway: "#323236",
  building: "#36363a",
  building3d: "#3a3a3e",
  road: "#4a4a50",
  roadCasing: "#36363a",
  path: "#404046",
  motorway: "#6a5634",
  motorwayCasing: "#463822",
  rail: "#3a3a40",
  boundary: "#48484e",
  labelHalo: "#101012",
  placeLabel: "#d4d4d8",
  roadLabel: "#b4b4ba",
  poiLabel: "#a4a4aa",
  waterLabel: "#94949c",
};

const HIDDEN_LAYERS = new Set(["natural_earth"]);

type PaintValues = Record<string, string | number>;
type PaintPropertyName = Parameters<MapLibreMap["setPaintProperty"]>[1];

interface PaletteRule {
  test: RegExp;
  type: string;
  paint: PaintValues;
}

const labelPaint = (color: string, halo: string): PaintValues => ({
  "text-color": color,
  "text-halo-color": halo,
  "text-halo-width": 1.2,
});

function rulesFor(colors: PaletteColors): PaletteRule[] {
  return [
    { test: /^background$/, type: "background", paint: { "background-color": colors.land } },

    { test: /^water$/, type: "fill", paint: { "fill-color": colors.water } },
    { test: /^park$/, type: "fill", paint: { "fill-color": colors.park } },
    { test: /^landcover_wood$/, type: "fill", paint: { "fill-color": colors.wood } },
    { test: /^landcover_grass$/, type: "fill", paint: { "fill-color": colors.grass } },
    { test: /^landcover_wetland$/, type: "fill", paint: { "fill-color": colors.wetland } },
    { test: /^landcover_sand$/, type: "fill", paint: { "fill-color": colors.sand } },
    { test: /^landcover_ice$/, type: "fill", paint: { "fill-color": colors.ice } },
    { test: /^landuse_residential$/, type: "fill", paint: { "fill-color": colors.residential } },
    { test: /^landuse_/, type: "fill", paint: { "fill-color": colors.landuseSoft } },
    { test: /^aeroway_fill$/, type: "fill", paint: { "fill-color": colors.aeroway } },
    { test: /^building$/, type: "fill", paint: { "fill-color": colors.building } },
    { test: /^building-3d$/, type: "fill-extrusion", paint: { "fill-extrusion-color": colors.building3d } },

    { test: /^park_outline$/, type: "line", paint: { "line-color": colors.parkOutline } },
    { test: /^waterway/, type: "line", paint: { "line-color": colors.water } },
    { test: /_(major|transit)_rail(_hatching)?$/, type: "line", paint: { "line-color": colors.rail } },
    { test: /_motorway(_link)?_casing$/, type: "line", paint: { "line-color": colors.motorwayCasing } },
    { test: /_motorway(_link)?$/, type: "line", paint: { "line-color": colors.motorway } },
    { test: /_path_pedestrian_casing$/, type: "line", paint: { "line-color": colors.roadCasing } },
    { test: /_path_pedestrian$/, type: "line", paint: { "line-color": colors.path } },
    { test: /_casing$/, type: "line", paint: { "line-color": colors.roadCasing } },
    { test: /^aeroway_(runway|taxiway)$/, type: "line", paint: { "line-color": colors.road } },
    { test: /^(road|bridge|tunnel)_/, type: "line", paint: { "line-color": colors.road } },
    { test: /^boundary_/, type: "line", paint: { "line-color": colors.boundary } },

    { test: /^(water_name|waterway_line_label)/, type: "symbol", paint: labelPaint(colors.waterLabel, colors.labelHalo) },
    { test: /^(poi_|airport$)/, type: "symbol", paint: labelPaint(colors.poiLabel, colors.labelHalo) },
    { test: /^(highway-|road_shield)/, type: "symbol", paint: labelPaint(colors.roadLabel, colors.labelHalo) },
    { test: /^label_/, type: "symbol", paint: labelPaint(colors.placeLabel, colors.labelHalo) },
  ];
}

type ColorSchemeMedia = Pick<MediaQueryList, "matches"> &
  Partial<Pick<MediaQueryList, "addEventListener" | "removeEventListener" | "addListener" | "removeListener">>;

function colorSchemeMedia(): ColorSchemeMedia | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia("(prefers-color-scheme: dark)");
}

export function resolveMapPaletteScheme(
  root: HTMLElement = document.documentElement,
  media: { matches: boolean } | null = colorSchemeMedia(),
): MapPaletteScheme {
  const theme = root.dataset.theme;
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return media?.matches ? "dark" : "light";
}

export function subscribeMapPaletteScheme(onChange: (scheme: MapPaletteScheme) => void): () => void {
  const media = colorSchemeMedia();
  let current = resolveMapPaletteScheme(document.documentElement, media);
  const emit = () => {
    const next = resolveMapPaletteScheme(document.documentElement, media);
    if (next === current) return;
    current = next;
    onChange(next);
  };
  let unsubscribeMedia: (() => void) | undefined;
  if (typeof media?.addEventListener === "function") {
    media.addEventListener("change", emit);
    unsubscribeMedia = () => media.removeEventListener?.("change", emit);
  } else if (typeof media?.addListener === "function") {
    media.addListener(emit);
    unsubscribeMedia = () => media.removeListener?.(emit);
  }
  const observer = new MutationObserver(emit);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    unsubscribeMedia?.();
    observer.disconnect();
  };
}

export function mapPaletteLandColor(scheme: MapPaletteScheme = resolveMapPaletteScheme()): string {
  return scheme === "dark" ? MAP_LAND_COLOR_DARK : MAP_LAND_COLOR;
}

/** Bake palette into a style JSON before MapLibre commits it, avoiding a default-color flash. */
export function transformMapStyle(
  style: StyleSpecification,
  scheme: MapPaletteScheme = resolveMapPaletteScheme(),
): StyleSpecification {
  const rules = rulesFor(scheme === "dark" ? DARK : LIGHT);
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (HIDDEN_LAYERS.has(layer.id)) {
        return {
          ...layer,
          layout: {
            ...("layout" in layer && layer.layout ? layer.layout : {}),
            visibility: "none",
          },
        };
      }
      const rule = rules.find((candidate) => candidate.type === layer.type && candidate.test.test(layer.id));
      if (!rule) return layer;
      return {
        ...layer,
        paint: {
          ...("paint" in layer && layer.paint ? layer.paint : {}),
          ...rule.paint,
        },
      };
    }),
  } as StyleSpecification;
}

export function applyMapPalette(map: MapLibreMap, scheme: MapPaletteScheme = resolveMapPaletteScheme()): void {
  const rules = rulesFor(scheme === "dark" ? DARK : LIGHT);
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (HIDDEN_LAYERS.has(layer.id)) {
      map.setLayoutProperty(layer.id, "visibility", "none");
      continue;
    }
    const rule = rules.find((candidate) => candidate.type === layer.type && candidate.test.test(layer.id));
    if (!rule) continue;
    for (const [property, value] of Object.entries(rule.paint)) {
      map.setPaintProperty(layer.id, property as PaintPropertyName, value);
    }
  }
}

interface ProbeMarkerColors {
  glow: string;
  glowSelected: string;
  glowOpacity: number;
  glowSelectedOpacity: number;
  halo: string;
  haloStroke: string;
  point: string;
  pointSelected: string;
  stroke: string;
  strokeSelected: string;
}

const PROBE_MARKER_LIGHT: ProbeMarkerColors = {
  glow: "#93c5fd",
  glowSelected: "#60a5fa",
  glowOpacity: 0.32,
  glowSelectedOpacity: 0.4,
  halo: "rgba(59, 130, 246, 0.12)",
  haloStroke: "rgba(59, 130, 246, 0.42)",
  point: "#bfdbfe",
  pointSelected: "#3b82f6",
  stroke: "rgba(255, 255, 255, 0.86)",
  strokeSelected: "rgba(255, 255, 255, 0.92)",
};

/** Dark markers: slate idle, clearer blue when selected — same family, no teal jump. */
const PROBE_MARKER_DARK: ProbeMarkerColors = {
  glow: "#5b6575",
  glowSelected: "#60a5fa",
  glowOpacity: 0.46,
  glowSelectedOpacity: 0.42,
  halo: "rgba(96, 165, 250, 0.16)",
  haloStroke: "rgba(147, 197, 253, 0.48)",
  point: "#8b95a5",
  pointSelected: "#60a5fa",
  stroke: "rgba(18, 18, 22, 0.88)",
  strokeSelected: "rgba(15, 23, 42, 0.9)",
};

function selectedCase<T extends string | number>(selected: T, idle: T): ["case", ["==", ["get", "selected"], true], T, T] {
  return ["case", ["==", ["get", "selected"], true], selected, idle];
}

export function probeMarkerPaint(scheme: MapPaletteScheme = resolveMapPaletteScheme()) {
  const colors = scheme === "dark" ? PROBE_MARKER_DARK : PROBE_MARKER_LIGHT;
  return {
    glow: {
      "circle-color": selectedCase(colors.glowSelected, colors.glow),
      "circle-opacity": selectedCase(colors.glowSelectedOpacity, colors.glowOpacity),
    },
    halo: {
      "circle-color": colors.halo,
      "circle-stroke-color": colors.haloStroke,
    },
    point: {
      "circle-color": selectedCase(colors.pointSelected, colors.point),
      "circle-stroke-color": selectedCase(colors.strokeSelected, colors.stroke),
    },
  };
}

export function applyProbeMarkerPalette(
  map: MapLibreMap,
  scheme: MapPaletteScheme = resolveMapPaletteScheme(),
): void {
  if (!map.getLayer("probe-points")) return;
  const paint = probeMarkerPaint(scheme);
  for (const [property, value] of Object.entries(paint.glow)) {
    map.setPaintProperty("probe-point-glow", property as PaintPropertyName, value);
  }
  for (const [property, value] of Object.entries(paint.halo)) {
    map.setPaintProperty("probe-selected-halo", property as PaintPropertyName, value);
  }
  for (const [property, value] of Object.entries(paint.point)) {
    map.setPaintProperty("probe-points", property as PaintPropertyName, value);
  }
}
