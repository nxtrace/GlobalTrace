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

    async getClusterExpansionZoom() {
      return 4;
    }
  }

  class FakePopup {
    readonly nodes: HTMLElement[] = [];

    setLngLat() {
      return this;
    }

    setDOMContent(node: HTMLElement) {
      this.nodes.push(node);
      return this;
    }

    addTo() {
      return this;
    }

    remove() {
      return this;
    }
  }

  class FakeNavigationControl {
    constructor(_options: unknown) {}
  }

  class FakeMap {
    static instances: FakeMap[] = [];

    readonly canvas = document.createElement("div");
    readonly sources = new Map<string, FakeSource>();
    readonly layers: Record<string, unknown>[] = [];
    readonly layerHandlers = new Map<string, FakeLayerHandler>();
    readonly eventHandlers = new Map<string, () => void>();
    readonly fitBoundsCalls: unknown[] = [];
    readonly easeToCalls: unknown[] = [];
    readonly removeCalls: unknown[] = [];
    readonly dragPan = {
      disable: () => undefined,
      enable: () => undefined,
    };
    renderedFeatures: Array<{ properties?: Record<string, unknown>; geometry?: unknown }> = [];

    constructor(options: { container: HTMLElement }) {
      FakeMap.instances.push(this);
      this.canvas.className = "maplibregl-canvas";
      Object.defineProperty(this.canvas, "getBoundingClientRect", {
        value: () => ({
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 1000,
          bottom: 500,
          width: 1000,
          height: 500,
          toJSON: () => ({}),
        }),
      });
      Object.defineProperty(this.canvas, "setPointerCapture", { value: () => undefined });
      options.container.appendChild(this.canvas);
    }

    addControl() {}

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
    FakePopup,
  };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: maplibreMock.FakeMap,
    NavigationControl: maplibreMock.FakeNavigationControl,
    Popup: maplibreMock.FakePopup,
  },
  Map: maplibreMock.FakeMap,
  NavigationControl: maplibreMock.FakeNavigationControl,
  Popup: maplibreMock.FakePopup,
}));

afterEach(() => {
  cleanup();
  maplibreMock.FakeMap.instances = [];
});

describe("ProbeMap", () => {
  it("fits multiple probes and clusters the source after load", () => {
    renderMap({ probes: [laProbe, deProbe, tokyoProbe] });
    const map = latestMap();

    act(() => map.triggerLoad());

    expect(map.sources.get("probes")?.options).toMatchObject({
      cluster: true,
      clusterMaxZoom: 8,
      clusterRadius: 46,
    });
    expect(map.layers.map((layer) => layer.id)).toEqual([
      "probe-clusters",
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
  });

  it("moves to a single filtered probe", async () => {
    const { rerender } = renderMap({ probes: [laProbe, deProbe, tokyoProbe] });
    const map = latestMap();
    act(() => map.triggerLoad());
    map.easeToCalls.length = 0;
    map.fitBoundsCalls.length = 0;

    rerender(probeMapElement({ probes: [laProbe] }));

    await waitFor(() => {
      expect(map.easeToCalls.at(-1)).toMatchObject({
        center: [-118.24, 34.05],
        zoom: 5.2,
      });
    });
    expect(map.fitBoundsCalls).toHaveLength(0);
  });

  it("does not rebuild the map when callback identities change", () => {
    const { rerender } = renderMap({ probes: [laProbe], onPickProbe: vi.fn() });
    const map = latestMap();
    act(() => map.triggerLoad());
    const nextPick = vi.fn();

    rerender(probeMapElement({ probes: [laProbe], onPickProbe: nextPick }));
    map.renderedFeatures = [{ properties: { index: 0 }, geometry: { type: "Point", coordinates: [-118.24, 34.05] } }];
    act(() => {
      void map.triggerLayer("click", "probe-points");
    });

    expect(maplibreMock.FakeMap.instances).toHaveLength(1);
    expect(map.removeCalls).toHaveLength(0);
    expect(nextPick).toHaveBeenCalledWith(laProbe);
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
  return (
    <ProbeMap
      probes={overrides.probes ?? [laProbe, deProbe, tokyoProbe]}
      totalProbes={overrides.totalProbes ?? 3}
      status={overrides.status ?? "ready"}
      selectionNotice={overrides.selectionNotice ?? ""}
      selectionActive={overrides.selectionActive ?? false}
      mapStyleUrl={overrides.mapStyleUrl ?? "/mock-style.json"}
      onPickProbe={overrides.onPickProbe ?? vi.fn()}
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

const boxVisibleProbe = mapProbe("Visible", 20, 20);
const boxOutsideProbe = mapProbe("Outside", 120, 20);
const boxBeforeProbe = mapProbe("Before", 5, 20);

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
