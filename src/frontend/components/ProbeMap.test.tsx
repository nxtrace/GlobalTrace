import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProbeMap } from "./ProbeMap";
import type { GlobalpingProbe } from "../../shared/types";

type FakeLayerHandler = (event: { point: { x: number; y: number } }) => void | Promise<void>;

const maplibreMock = vi.hoisted(() => {
  class FakeSource {
    readonly setDataCalls: unknown[] = [];
    readonly options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
    }

    setData(data: unknown) {
      this.setDataCalls.push(data);
      return this;
    }

  }

  class FakeNavigationControl {
    constructor(_options: unknown) {}
  }

  class FakeMap {
    static instances: FakeMap[] = [];
    static canvasRect = { width: 1000, height: 500 };
    static cameraForBoundsResult: { center: [number, number]; zoom: number; bearing: number } | undefined = {
      center: [12, 30],
      zoom: 0.92,
      bearing: 0,
    };

    readonly canvas = document.createElement("div");
    readonly sources = new Map<string, FakeSource>();
    readonly layers: Record<string, unknown>[] = [];
    readonly layerHandlers = new Map<string, FakeLayerHandler>();
    readonly eventHandlers = new Map<string, () => void>();
    readonly options: Record<string, unknown>;
    readonly fitBoundsCalls: unknown[] = [];
    readonly cameraForBoundsCalls: unknown[] = [];
    readonly easeToCalls: unknown[] = [];
    readonly removeCalls: unknown[] = [];
    readonly setPaintPropertyCalls: unknown[] = [];
    readonly setProjectionCalls: unknown[] = [];
    readonly dragPan = {
      disable: () => undefined,
      enable: () => undefined,
    };
    renderedFeatures: Array<{ properties?: Record<string, unknown>; geometry?: unknown }> = [];

    constructor(options: { container: HTMLElement } & Record<string, unknown>) {
      FakeMap.instances.push(this);
      this.options = options;
      this.canvas.className = "maplibregl-canvas";
      Object.defineProperty(this.canvas, "getBoundingClientRect", {
        value: () => {
          const { width, height } = FakeMap.canvasRect;
          return {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: width,
            bottom: height,
            width,
            height,
            toJSON: () => ({}),
          };
        },
      });
      Object.defineProperty(this.canvas, "setPointerCapture", { value: () => undefined });
      options.container.appendChild(this.canvas);
    }

    addControl() {}

    setProjection(projection: unknown) {
      this.setProjectionCalls.push(projection);
      return this;
    }

    on(event: string, layerOrHandler: string | (() => void) | FakeLayerHandler, handler?: FakeLayerHandler) {
      if (typeof layerOrHandler === "string" && handler) {
        this.layerHandlers.set(`${event}:${layerOrHandler}`, handler);
      } else if (typeof layerOrHandler === "function") {
        this.eventHandlers.set(event, layerOrHandler as () => void);
      }
      return this;
    }

    off(event: string, layer: string) {
      this.layerHandlers.delete(`${event}:${layer}`);
      return this;
    }

    addSource(id: string, options: Record<string, unknown>) {
      this.sources.set(id, new FakeSource(options));
    }

    addLayer(layer: Record<string, unknown>) {
      this.layers.push(layer);
    }

    setPaintProperty(...args: unknown[]) {
      this.setPaintPropertyCalls.push(args);
      return this;
    }

    getSource(id: string) {
      return this.sources.get(id);
    }

    getCanvasContainer() {
      return this.canvas;
    }

    getCanvas() {
      return this.canvas;
    }

    getZoom() {
      return 1.2;
    }

    queryRenderedFeatures() {
      return this.renderedFeatures;
    }

    unproject(point: [number, number]) {
      return { lng: point[0] / 10, lat: (500 - point[1]) / 10 };
    }

    project(point: [number, number]) {
      return { x: point[0] * 10, y: 500 - point[1] * 10 };
    }

    fitBounds(...args: unknown[]) {
      this.fitBoundsCalls.push(args);
      return this;
    }

    cameraForBounds(...args: unknown[]) {
      this.cameraForBoundsCalls.push(args);
      return FakeMap.cameraForBoundsResult;
    }

    easeTo(options: unknown) {
      this.easeToCalls.push(options);
      return this;
    }

    resize() {}

    remove() {
      this.removeCalls.push(true);
    }

    triggerLoad() {
      this.eventHandlers.get("load")?.();
    }

    triggerLayer(event: string, layer: string, point = { x: 10, y: 10 }) {
      return this.layerHandlers.get(`${event}:${layer}`)?.({ point });
    }
  }

  return {
    FakeMap,
    FakeNavigationControl,
  };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: maplibreMock.FakeMap,
    NavigationControl: maplibreMock.FakeNavigationControl,
  },
  Map: maplibreMock.FakeMap,
  NavigationControl: maplibreMock.FakeNavigationControl,
}));

afterEach(() => {
  cleanup();
  maplibreMock.FakeMap.instances = [];
  maplibreMock.FakeMap.canvasRect = { width: 1000, height: 500 };
  maplibreMock.FakeMap.cameraForBoundsResult = { center: [12, 30], zoom: 0.92, bearing: 0 };
  setWindowSize(1024, 768);
});

describe("ProbeMap", () => {
  it("keeps empty state liquid surface separate from the map canvas", () => {
    renderMap({ probes: [], status: "ready" });

    expect(document.querySelector(".map-status-surface[data-liquid-glass]")).toBeNull();
    expect(screen.getByText("没有匹配的在线 probe").closest(".map-empty-surface[data-liquid-glass]")).not.toBeNull();
    expect(document.querySelector(".map-container[data-liquid-glass]")).toBeNull();
    expect(document.querySelector(".maplibregl-canvas[data-liquid-glass]")).toBeNull();
  });

  it("fits multiple probes and renders unclustered glow points after load", () => {
    renderMap({ probes: [laProbe, deProbe, tokyoProbe] });
    const map = latestMap();

    act(() => map.triggerLoad());

    expect(map.sources.get("probes")?.options).toMatchObject({ type: "geojson" });
    expect(map.sources.get("probes")?.options).not.toHaveProperty("cluster");
    expect(map.layers.map((layer) => layer.id)).toEqual([
      "probe-point-glow",
      "probe-selected-halo",
      "probe-points",
    ]);
    expect(map.fitBoundsCalls.at(-1)).toEqual([
      [
        [-118.24, 34.05],
        [139.76, 50.48],
      ],
      expect.objectContaining({ maxZoom: 5.2 }),
    ]);
    expect(map.setProjectionCalls).toEqual([{ type: "mercator" }]);
  });

  it("uses a tighter 1000p desktop overview zoom after fitting probes", () => {
    setWindowSize(1440, 1000);
    maplibreMock.FakeMap.canvasRect = { width: 1000, height: 340 };
    maplibreMock.FakeMap.cameraForBoundsResult = { center: [12, 30], zoom: 0.92, bearing: 0 };
    renderMap({ probes: [laProbe, deProbe, tokyoProbe] });
    const map = latestMap();

    act(() => map.triggerLoad());

    expect(map.cameraForBoundsCalls.at(-1)).toEqual([
      [
        [-118.24, 34.05],
        [139.76, 50.48],
      ],
      {
        padding: { top: 48, right: 24, bottom: 28, left: 24 },
        maxZoom: 5.2,
      },
    ]);
    expect(map.easeToCalls.at(-1)).toMatchObject({
      center: [12, 30],
      zoom: 1.15,
      duration: 420,
      essential: true,
    });
    expect(map.fitBoundsCalls).toHaveLength(0);
  });

  it("keeps the fitted desktop camera when it is already tighter than the 1000p zoom floor", () => {
    setWindowSize(1440, 1000);
    maplibreMock.FakeMap.canvasRect = { width: 1000, height: 340 };
    maplibreMock.FakeMap.cameraForBoundsResult = { center: [12, 30], zoom: 1.3, bearing: 0 };
    renderMap({ probes: [laProbe, deProbe, tokyoProbe] });
    const map = latestMap();

    act(() => map.triggerLoad());

    expect(map.easeToCalls.at(-1)).toMatchObject({ zoom: 1.3 });
    expect(map.fitBoundsCalls).toHaveLength(0);
  });

  it("keeps the standard fit on mobile and non-1000p desktop viewports", () => {
    for (const viewport of [
      { width: 390, height: 844, canvas: { width: 390, height: 354 } },
      { width: 1280, height: 800, canvas: { width: 900, height: 300 } },
    ]) {
      cleanup();
      maplibreMock.FakeMap.instances = [];
      setWindowSize(viewport.width, viewport.height);
      maplibreMock.FakeMap.canvasRect = viewport.canvas;
      renderMap({ probes: [laProbe, deProbe, tokyoProbe] });
      const map = latestMap();

      act(() => map.triggerLoad());

      expect(map.cameraForBoundsCalls).toHaveLength(0);
      expect(map.fitBoundsCalls.at(-1)).toEqual([
        [
          [-118.24, 34.05],
          [139.76, 50.48],
        ],
        expect.objectContaining({
          padding: { top: 68, right: 42, bottom: 42, left: 42 },
          maxZoom: 5.2,
        }),
      ]);
    }
  });

  it("keeps map candidates global when the filtered count changes", async () => {
    const mapProbes = [laProbe, deProbe, tokyoProbe];
    const { rerender } = renderMap({ probes: mapProbes });
    const map = latestMap();
    act(() => map.triggerLoad());
    map.easeToCalls.length = 0;
    map.fitBoundsCalls.length = 0;

    rerender(probeMapElement({ probes: mapProbes }));

    expect(map.easeToCalls).toHaveLength(0);
    expect(map.fitBoundsCalls).toHaveLength(0);
  });

  it("opens an ASN picker and selects city, country, and ASN without network", async () => {
    const onPickAsn = vi.fn();
    renderMap({ probes: sanJoseProbes, onPickAsn });
    const map = latestMap();
    act(() => map.triggerLoad());
    map.renderedFeatures = [{ properties: { index: 0 }, geometry: { type: "Point", coordinates: [-121.89, 37.34] } }];

    act(() => {
      void map.triggerLayer("click", "probe-points");
    });

    expect(screen.getByRole("dialog", { name: "San Jose probe candidates" })).toBeVisible();
    expect(screen.getByText("+ 4")).toBeVisible();
    expect(screen.getByRole("option", { name: "Oracle AS31898 ×2" })).toBeVisible();
    expect(screen.getByRole("option", { name: "LeaseWeb AS7203 ×1" })).toBeVisible();

    fireEvent.click(screen.getByRole("option", { name: "Oracle AS31898 ×2" }));

    expect(onPickAsn).toHaveBeenCalledWith({
      magic: "San Jose+US+AS31898",
      city: "San Jose",
      country: "US",
      asn: "AS31898",
      network: "Oracle",
      count: 2,
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "San Jose probe candidates" })).toBeNull();
    });
  });

  it("keeps same-location ASN candidates available after filtering to one ASN", () => {
    renderMap({ probes: sanJoseProbes });
    const map = latestMap();
    act(() => map.triggerLoad());
    map.renderedFeatures = [{ properties: { index: 0 }, geometry: { type: "Point", coordinates: [-121.89, 37.34] } }];

    act(() => {
      void map.triggerLayer("click", "probe-points");
    });

    expect(screen.getByText("+ 4")).toBeVisible();
    expect(screen.getByRole("option", { name: "Oracle AS31898 ×2" })).toBeVisible();
    expect(screen.getByRole("option", { name: "LeaseWeb AS7203 ×1" })).toBeVisible();
    expect(screen.getByRole("option", { name: "xTom AS6233 ×1" })).toBeVisible();
  });

  it("shows a hover preview picker and hides it after leaving a point", async () => {
    renderMap({ probes: sanJoseProbes });
    const map = latestMap();
    act(() => map.triggerLoad());
    map.renderedFeatures = [{ properties: { index: 0 }, geometry: { type: "Point", coordinates: [-121.89, 37.34] } }];

    act(() => {
      void map.triggerLayer("mouseenter", "probe-points");
    });
    expect(screen.getByRole("dialog", { name: "San Jose probe candidates" })).toBeVisible();

    act(() => {
      void map.triggerLayer("mouseleave", "probe-points");
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "San Jose probe candidates" })).toBeNull();
    });
  });

  it("does not rebuild the map when callback identities change", () => {
    const { rerender } = renderMap({ probes: [laProbe], onPickAsn: vi.fn() });
    const map = latestMap();
    act(() => map.triggerLoad());
    const nextPick = vi.fn();

    rerender(probeMapElement({ probes: [laProbe], onPickAsn: nextPick }));
    map.renderedFeatures = [{ properties: { index: 0 }, geometry: { type: "Point", coordinates: [-118.24, 34.05] } }];
    act(() => {
      void map.triggerLayer("click", "probe-points");
    });
    fireEvent.click(screen.getByRole("option", { name: "Comcast AS7922 ×1" }));

    expect(maplibreMock.FakeMap.instances).toHaveLength(1);
    expect(map.removeCalls).toHaveLength(0);
    expect(nextPick).toHaveBeenCalledWith(expect.objectContaining({ magic: "Los Angeles+US+AS7922" }));
  });

  it("clamps box selection coordinates when the pointer is released outside the map", async () => {
    const onBoxSelect = vi.fn();
    renderMap({ probes: [boxVisibleProbe, boxOutsideProbe, boxBeforeProbe], onBoxSelect });
    const map = latestMap();
    act(() => map.triggerLoad());

    fireEvent.click(screen.getByRole("button", { name: "框选" }));
    await screen.findByRole("button", { name: "拖拽选择" });
    act(() => {
      dispatchPointer(map.canvas, "pointerdown", { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
      dispatchPointer(window, "pointermove", { clientX: 1500, clientY: 400, pointerId: 1 });
      dispatchPointer(window, "pointerup", { clientX: 1500, clientY: 400, pointerId: 1 });
    });

    await waitFor(() => {
      expect(onBoxSelect).toHaveBeenCalledWith([boxVisibleProbe]);
    });
  });
});

function renderMap(overrides: Partial<React.ComponentProps<typeof ProbeMap>> = {}) {
  return render(probeMapElement(overrides));
}

function probeMapElement(overrides: Partial<React.ComponentProps<typeof ProbeMap>> = {}) {
  const nextProbes = overrides.probes ?? [laProbe, deProbe, tokyoProbe];
  return (
    <ProbeMap
      probes={nextProbes}
      status={overrides.status ?? "ready"}
      selectionActive={overrides.selectionActive ?? false}
      mapStyleUrl={overrides.mapStyleUrl ?? "/mock-style.json"}
      onPickAsn={overrides.onPickAsn ?? vi.fn()}
      onBoxSelect={overrides.onBoxSelect ?? vi.fn()}
      onClearSelection={overrides.onClearSelection ?? vi.fn()}
    />
  );
}

function latestMap(): InstanceType<typeof maplibreMock.FakeMap> {
  const map = maplibreMock.FakeMap.instances.at(-1);
  if (!map) throw new Error("map was not created");
  return map;
}

function setWindowSize(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function dispatchPointer(
  target: Window | HTMLElement,
  type: string,
  init: { clientX: number; clientY: number; button?: number; pointerId: number },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    pointerId: { value: init.pointerId },
  });
  target.dispatchEvent(event);
}

const laProbe: GlobalpingProbe = {
  location: {
    continent: "NA",
    region: "Northern America",
    country: "US",
    state: "CA",
    city: "Los Angeles",
    asn: 7922,
    latitude: 34.05,
    longitude: -118.24,
    network: "Comcast",
  },
  tags: ["eyeball-network"],
  resolvers: [],
};

const deProbe: GlobalpingProbe = {
  location: {
    continent: "EU",
    region: "Western Europe",
    country: "DE",
    state: null,
    city: "Falkenstein",
    asn: 24940,
    latitude: 50.48,
    longitude: 12.37,
    network: "Hetzner Online",
  },
  tags: ["datacenter-network"],
  resolvers: [],
};

const tokyoProbe: GlobalpingProbe = {
  location: {
    continent: "AS",
    region: "Eastern Asia",
    country: "JP",
    state: null,
    city: "Tokyo",
    asn: 64500,
    latitude: 35.68,
    longitude: 139.76,
    network: "ExampleNet",
  },
  tags: ["datacenter-network"],
  resolvers: [],
};

const sanJoseProbes: GlobalpingProbe[] = [
  sanJoseProbe("Oracle", 31898, -121.89, 37.34),
  sanJoseProbe("Oracle", 31898, -121.9, 37.35),
  sanJoseProbe("LeaseWeb", 7203, -121.91, 37.33),
  sanJoseProbe("xTom", 6233, -121.88, 37.32),
];

const boxVisibleProbe = mapProbe("Visible", 20, 20);
const boxOutsideProbe = mapProbe("Outside", 120, 20);
const boxBeforeProbe = mapProbe("Before", 5, 20);

function sanJoseProbe(network: string, asn: number, longitude: number, latitude: number): GlobalpingProbe {
  return {
    location: {
      continent: "NA",
      region: "Northern America",
      country: "US",
      state: "CA",
      city: "San Jose",
      asn,
      latitude,
      longitude,
      network,
    },
    tags: ["datacenter-network"],
    resolvers: [],
  };
}

function mapProbe(city: string, longitude: number, latitude: number): GlobalpingProbe {
  return {
    location: {
      continent: "NA",
      region: "Test",
      country: "US",
      state: null,
      city,
      asn: 64500,
      latitude,
      longitude,
      network: "ExampleNet",
    },
    tags: ["eyeball-network"],
    resolvers: [],
  };
}
