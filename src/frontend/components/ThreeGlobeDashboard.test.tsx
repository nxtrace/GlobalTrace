import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlobalpingProbe, TraceResultResponse } from "../../shared/types";
import { buildGlobeRoutes, globePalette, ThreeGlobeDashboard } from "./ThreeGlobeDashboard";

const threeMock = vi.hoisted(() => {
  class FakeVector3 {
    x: number;
    y: number;
    z: number;

    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }

    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }

    copy(value: FakeVector3) {
      this.x = value.x;
      this.y = value.y;
      this.z = value.z;
      return this;
    }

    clone() {
      return new FakeVector3(this.x, this.y, this.z);
    }

    lerp(value: FakeVector3, alpha: number) {
      this.x += (value.x - this.x) * alpha;
      this.y += (value.y - this.y) * alpha;
      this.z += (value.z - this.z) * alpha;
      return this;
    }

    normalize() {
      const length = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= length;
      this.y /= length;
      this.z /= length;
      return this;
    }

    multiplyScalar(value: number) {
      this.x *= value;
      this.y *= value;
      this.z *= value;
      return this;
    }

    angleTo(value: FakeVector3) {
      const a = this.clone().normalize();
      const b = value.clone().normalize();
      const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
      return Math.acos(dot);
    }
  }

  class FakeVector2 {
    x = 0;
    y = 0;
  }

  class FakeObject3D {
    children: FakeObject3D[] = [];
    position = new FakeVector3();
    rotation = { x: 0, y: 0, z: 0 };
    userData: Record<string, unknown> = {};

    add(...children: FakeObject3D[]) {
      this.children.push(...children);
    }

    remove(child: FakeObject3D) {
      this.children = this.children.filter((item) => item !== child);
    }
  }

  class FakeScene extends FakeObject3D {
    background: unknown;
  }

  class FakeGroup extends FakeObject3D {}

  class FakeMesh extends FakeObject3D {
    geometry: unknown;
    material: unknown;

    constructor(geometry: unknown, material: unknown) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }

  class FakeLineSegments extends FakeMesh {}

  class FakeCamera extends FakeObject3D {
    aspect = 1;

    constructor(
      readonly fov: number,
      aspect: number,
      readonly near: number,
      readonly far: number,
    ) {
      super();
      this.aspect = aspect;
    }

    updateProjectionMatrix() {}
  }

  class FakeRenderer {
    static instances: FakeRenderer[] = [];

    readonly domElement = document.createElement("canvas");
    readonly dispose = vi.fn();
    readonly render = vi.fn();
    readonly setPixelRatio = vi.fn();
    readonly setSize = vi.fn();

    constructor() {
      FakeRenderer.instances.push(this);
      Object.defineProperty(this.domElement, "getBoundingClientRect", {
        value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }),
      });
      Object.defineProperty(this.domElement, "setPointerCapture", { value: vi.fn() });
      Object.defineProperty(this.domElement, "releasePointerCapture", { value: vi.fn() });
    }
  }

  class FakeRaycaster {
    setFromCamera() {}

    intersectObjects(objects: FakeObject3D[]) {
      return objects.length ? [{ object: objects[0] }] : [];
    }
  }

  class FakeGeometry {
    readonly dispose = vi.fn();
    setAttribute() {}
  }

  class FakeMaterial {
    readonly dispose = vi.fn();
    constructor(readonly options: unknown) {}
  }

  class FakeCurve {
    constructor(readonly points: FakeVector3[]) {}
  }

  return {
    FakeRenderer,
    module: {
      AmbientLight: class extends FakeObject3D {
        constructor(readonly color: unknown, readonly intensity: unknown) {
          super();
        }
      },
      BackSide: 1,
      BufferGeometry: FakeGeometry,
      CatmullRomCurve3: FakeCurve,
      Color: class {
        constructor(readonly value: unknown) {}
      },
      DirectionalLight: class extends FakeObject3D {
        constructor(readonly color: unknown, readonly intensity: unknown) {
          super();
        }
      },
      Float32BufferAttribute: class {
        constructor(readonly values: unknown, readonly itemSize: number) {}
      },
      Group: FakeGroup,
      LineBasicMaterial: FakeMaterial,
      LineSegments: FakeLineSegments,
      Mesh: FakeMesh,
      MeshBasicMaterial: FakeMaterial,
      MeshStandardMaterial: FakeMaterial,
      Object3D: FakeObject3D,
      PerspectiveCamera: FakeCamera,
      Raycaster: FakeRaycaster,
      Scene: FakeScene,
      SphereGeometry: FakeGeometry,
      TubeGeometry: FakeGeometry,
      Vector2: FakeVector2,
      Vector3: FakeVector3,
      WebGLRenderer: FakeRenderer,
    },
  };
});

vi.mock("three", () => threeMock.module);

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  threeMock.FakeRenderer.instances = [];
  vi.unstubAllGlobals();
});

describe("ThreeGlobeDashboard", () => {
  it("uses distinct dark and light map palettes", () => {
    const dark = globePalette("dark");
    const light = globePalette("light");

    expect(dark.background).toBe(0x050a12);
    expect(dark.ocean).toBe(0x071522);
    expect(dark.activeRoute).toBe(0x29e6cf);
    expect(light.background).toBe(0xf5f8fb);
    expect(light.ocean).toBe(0xdceaf1);
    expect(light.activeRoute).toBe(0x009e9a);
    expect(dark.background).not.toBe(light.background);
    expect(dark.boundaryOpacity).toBeLessThan(light.boundaryOpacity);
    expect(dark.graticuleOpacity).toBeLessThan(light.graticuleOpacity);
  });

  it("renders the globe scene and picks probes through the 3D canvas", async () => {
    const onPickProbe = vi.fn();
    renderDashboard({ onPickProbe });

    await waitFor(() => expect(threeMock.FakeRenderer.instances).toHaveLength(1));
    expect(screen.getByText("2 / 3 probes")).toBeInTheDocument();

    const canvas = threeMock.FakeRenderer.instances[0].domElement;
    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 80, clientY: 80, pointerId: 1 });

    expect(onPickProbe).toHaveBeenCalledWith(laProbe);
  });

  it("does not pick probes after dragging or pointer cancellation", async () => {
    const onPickProbe = vi.fn();
    renderDashboard({ onPickProbe });

    await waitFor(() => expect(threeMock.FakeRenderer.instances).toHaveLength(1));

    const canvas = threeMock.FakeRenderer.instances[0].domElement;
    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 80, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 82, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 82, pointerId: 1 });

    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 80, pointerId: 2 });
    fireEvent.pointerCancel(canvas, { clientX: 80, clientY: 80, pointerId: 2 });

    expect(onPickProbe).not.toHaveBeenCalled();
  });

  it("shows all result route cards but only renders the active route on the globe", async () => {
    const onPickProbe = vi.fn();
    renderDashboard({ result: sampleResult, availableResult: sampleResult, onPickProbe });

    await waitFor(() => expect(threeMock.FakeRenderer.instances).toHaveLength(1));
    const stage = screen.getByTestId("three-globe-stage") as HTMLDivElement & {
      __globalTraceThreeRouteCount?: number;
      __globalTraceThreeActiveRouteIndex?: number;
      __globalTraceThreeRenderedProbeCount?: number;
      __globalTraceThreeRenderedRouteCount?: number;
      __globalTraceThreeRenderedSegmentCount?: number;
    };
    expect(stage.__globalTraceThreeRouteCount).toBe(2);
    expect(stage.__globalTraceThreeRenderedProbeCount).toBe(0);
    expect(stage.__globalTraceThreeRenderedRouteCount).toBe(1);
    expect(stage.__globalTraceThreeRenderedSegmentCount).toBe(1);
    const routeCards = within(screen.getByLabelText("3D probe routes"));
    expect(routeCards.getByRole("button", { name: /Los Angeles/ })).toHaveClass("active");

    const canvas = threeMock.FakeRenderer.instances[0].domElement;
    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 80, clientY: 80, pointerId: 1 });
    expect(onPickProbe).not.toHaveBeenCalled();

    fireEvent.click(routeCards.getByRole("button", { name: /Tokyo/ }));

    expect(routeCards.getByRole("button", { name: /Tokyo/ })).toHaveClass("active");
    expect(stage.__globalTraceThreeActiveRouteIndex).toBe(1);
    expect(stage.__globalTraceThreeRenderedRouteCount).toBe(1);
    expect(stage.__globalTraceThreeRenderedSegmentCount).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /TTL 2/ }));
    expect(screen.getByRole("button", { name: /TTL 2/ })).toHaveClass("active");
  });

  it("keeps repeated-coordinate hops in the list but skips their route segment", async () => {
    renderDashboard({ result: repeatedCoordinateResult, availableResult: repeatedCoordinateResult });

    await waitFor(() => expect(threeMock.FakeRenderer.instances).toHaveLength(1));
    const stage = screen.getByTestId("three-globe-stage") as HTMLDivElement & {
      __globalTraceThreeRenderedRouteCount?: number;
      __globalTraceThreeRenderedSegmentCount?: number;
    };

    expect(stage.__globalTraceThreeRenderedRouteCount).toBe(1);
    expect(stage.__globalTraceThreeRenderedSegmentCount).toBe(2);
    expect(screen.getByRole("button", { name: /TTL 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /TTL 2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /TTL 3/ })).toBeInTheDocument();
  });

  it("cleans up the renderer on unmount", async () => {
    const rendered = renderDashboard();
    await waitFor(() => expect(threeMock.FakeRenderer.instances).toHaveLength(1));
    const renderer = threeMock.FakeRenderer.instances[0];
    const stage = screen.getByTestId("three-globe-stage") as HTMLDivElement & {
      __globalTraceThreeRendererDisposed?: boolean;
    };

    rendered.unmount();

    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(stage.__globalTraceThreeRendererDisposed).toBe(true);
  });

  it("skips hops without drawable GeoIP coordinates", () => {
    const routes = buildGlobeRoutes(invalidHopResult);

    expect(routes[0].points.map((point) => point.ttl).filter(Boolean)).toEqual([2]);
  });
});

function renderDashboard(overrides: Partial<ComponentProps<typeof ThreeGlobeDashboard>> = {}) {
  return render(
    <ThreeGlobeDashboard
      probes={[laProbe, tokyoProbe]}
      totalProbes={3}
      probesStatus="ready"
      selectionNotice=""
      selectionActive={false}
      result={null}
      availableResult={null}
      loading={false}
      themeMode="light"
      onPickProbe={vi.fn()}
      onClearSelection={vi.fn()}
      onShowResult={vi.fn()}
      onCloseResult={vi.fn()}
      {...overrides}
    />,
  );
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

const sampleResult: TraceResultResponse = {
  measurementId: "m123",
  type: "mtr",
  target: "globalping.io",
  status: "finished",
  probesCount: 2,
  enrichment: { status: "complete", cached: 0, fetched: 3, errors: [] },
  results: [
    {
      id: "probe-la",
      probe: {
        ...laProbe.location,
        tags: laProbe.tags,
        resolvers: [],
      },
      status: "finished",
      resolvedAddress: "8.8.8.8",
      resolvedHostname: "dns.google",
      rawOutput: "",
      hops: [
        {
          ttl: 1,
          ip: "203.0.113.1",
          hostname: null,
          asn: [64500],
          timingsMs: [10],
          stats: { min: 10, avg: 10, max: 10, total: 3, rcv: 3, drop: 0, loss: 0 },
          geo: { ip: "203.0.113.1", lng: -122.08, lat: 37.39, city: "San Jose", country: "US" },
        },
      ],
    },
    {
      id: "probe-tokyo",
      probe: {
        ...tokyoProbe.location,
        tags: tokyoProbe.tags,
        resolvers: [],
      },
      status: "finished",
      resolvedAddress: "8.8.4.4",
      resolvedHostname: "dns.google",
      rawOutput: "",
      hops: [
        {
          ttl: 2,
          ip: "198.51.100.2",
          hostname: null,
          asn: [15169],
          timingsMs: [22],
          stats: { min: 20, avg: 22, max: 25, total: 3, rcv: 3, drop: 0, loss: 0 },
          geo: { ip: "198.51.100.2", lng: 140, lat: 36, city: "Tokyo", country: "JP" },
        },
      ],
    },
  ],
};

const invalidHopResult: TraceResultResponse = {
  ...sampleResult,
  results: [
    {
      ...sampleResult.results[0],
      hops: [
        { ...sampleResult.results[0].hops[0], ttl: 1, geo: { ip: "203.0.113.1", lng: 0, lat: 0 } },
        { ...sampleResult.results[0].hops[0], ttl: 2, geo: { ip: "203.0.113.2", lng: 10, lat: 20 } },
      ],
    },
  ],
};

const repeatedCoordinateResult: TraceResultResponse = {
  ...sampleResult,
  probesCount: 1,
  results: [
    {
      ...sampleResult.results[0],
      hops: [
        {
          ...sampleResult.results[0].hops[0],
          ttl: 1,
          ip: "203.0.113.1",
          geo: { ip: "203.0.113.1", lng: -122.08, lat: 37.39, city: "San Jose", country: "US" },
        },
        {
          ...sampleResult.results[0].hops[0],
          ttl: 2,
          ip: "203.0.113.2",
          geo: { ip: "203.0.113.2", lng: -122.08, lat: 37.39, city: "San Jose", country: "US" },
        },
        {
          ...sampleResult.results[0].hops[0],
          ttl: 3,
          ip: "198.51.100.3",
          geo: { ip: "198.51.100.3", lng: 139.76, lat: 35.68, city: "Tokyo", country: "JP" },
        },
      ],
    },
  ],
};
