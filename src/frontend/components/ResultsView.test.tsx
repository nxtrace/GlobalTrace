import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildResultMapData, ResultsView } from "./ResultsView";
import type { TraceHop, TraceResultResponse } from "../../shared/types";

const maplibreMock = vi.hoisted(() => {
  class FakeSource {
    readonly setDataCalls: unknown[] = [];

    constructor(readonly data: unknown) {}

    setData(data: unknown) {
      this.setDataCalls.push(data);
      return this;
    }
  }

  class FakeMap {
    static instances: FakeMap[] = [];

    readonly sources = new Map<string, FakeSource>();
    readonly layers: Record<string, unknown>[] = [];
    readonly eventHandlers = new Map<string, () => void>();
    readonly layerEventHandlers = new Map<string, (event: { features?: Array<{ properties?: Record<string, unknown> }> }) => void>();
    readonly fitBoundsCalls: unknown[] = [];
    readonly easeToCalls: unknown[] = [];
    readonly removeCalls: unknown[] = [];
    readonly setFilterCalls: unknown[] = [];
    readonly canvas: HTMLElement;

    constructor(options: { container: HTMLElement }) {
      FakeMap.instances.push(this);
      const canvas = document.createElement("div");
      canvas.className = "maplibregl-canvas";
      options.container.appendChild(canvas);
      this.canvas = canvas;
    }

    on(event: string, layerOrHandler: string | (() => void), handler?: (event: { features?: Array<{ properties?: Record<string, unknown> }> }) => void) {
      if (typeof layerOrHandler === "string") {
        if (handler) this.layerEventHandlers.set(`${event}:${layerOrHandler}`, handler);
        return this;
      }
      this.eventHandlers.set(event, layerOrHandler);
      return this;
    }

    addSource(id: string, options: { data: unknown }) {
      this.sources.set(id, new FakeSource(options.data));
    }

    addLayer(layer: Record<string, unknown>) {
      this.layers.push(layer);
    }

    getSource(id: string) {
      return this.sources.get(id);
    }

    setFilter(...args: unknown[]) {
      this.setFilterCalls.push(args);
      return this;
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

    getCanvas() {
      return this.canvas;
    }

    remove() {
      this.removeCalls.push(true);
    }

    triggerLoad() {
      this.eventHandlers.get("load")?.();
    }

    triggerLayerClick(layer: string, properties: Record<string, unknown>) {
      this.layerEventHandlers.get(`click:${layer}`)?.({ features: [{ properties }] });
    }
  }

  class FakePopup {
    static instances: FakePopup[] = [];

    readonly setLngLatCalls: unknown[] = [];
    readonly setHTMLCalls: string[] = [];
    readonly addToCalls: unknown[] = [];
    readonly removeCalls: boolean[] = [];

    constructor(readonly options: unknown) {
      FakePopup.instances.push(this);
    }

    setLngLat(coordinate: unknown) {
      this.setLngLatCalls.push(coordinate);
      return this;
    }

    setHTML(html: string) {
      this.setHTMLCalls.push(html);
      return this;
    }

    addTo(map: unknown) {
      this.addToCalls.push(map);
      return this;
    }

    remove() {
      this.removeCalls.push(true);
      return this;
    }
  }

  return { FakeMap, FakePopup };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: maplibreMock.FakeMap,
    Popup: maplibreMock.FakePopup,
  },
  Map: maplibreMock.FakeMap,
  Popup: maplibreMock.FakePopup,
}));

afterEach(() => {
  cleanup();
  maplibreMock.FakeMap.instances = [];
  maplibreMock.FakePopup.instances = [];
  vi.restoreAllMocks();
});

describe("ResultsView", () => {
  it("renders the waiting state before a measurement exists", () => {
    render(<ResultsView result={null} mapStyleUrl="about:blank" renderMap={false} />);

    expect(screen.getByText("等待网络路径诊断")).toBeInTheDocument();
  });

  it("renders MTR hop rows with enriched GeoIP fields and raw output", () => {
    render(<ResultsView result={sampleResult} mapStyleUrl="about:blank" renderMap={false} />);

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "TTL",
      "IP / hostname",
      "loss",
      "avg",
      "min",
      "max",
      "ASN",
      "region",
      "owner / ISP",
    ]);
    expect(within(table).queryByRole("columnheader", { name: "source" })).not.toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("GeoIP: 完成")).toBeInTheDocument();
    expect(within(table).getByText("8.8.8.8")).toBeInTheDocument();
    expect(within(table).getByText("dns.google")).toBeInTheDocument();
    expect(screen.getByText("AS15169")).toBeInTheDocument();
    expect(screen.getByText("Google LLC / Google")).toBeInTheDocument();
    expect(screen.getByText("美国，加利福尼亚，山景城")).toBeInTheDocument();
    expect(screen.getByText("raw output")).toBeInTheDocument();
  });

  it("renders target metrics from the active resolved destination hop", () => {
    render(<ResultsView result={sampleResult} mapStyleUrl="about:blank" renderMap={false} />);

    const summary = screen.getByLabelText("trace summary");
    expectSummaryMetric("目标延迟", "1.2 ms");
    expectSummaryMetric("目标丢包", "0.0%");
    expect(within(summary).queryByText("public IP")).not.toBeInTheDocument();
    expect(within(summary).queryByText("avg loss")).not.toBeInTheDocument();
  });

  it("falls back to English GeoIP fields when Chinese fields are absent", () => {
    render(<ResultsView result={englishOnlyRegionResult} mapStyleUrl="about:blank" renderMap={false} />);

    expect(screen.getByText("United States，California，Mountain View")).toBeInTheDocument();
  });

  it("treats hostname values matching the IP as empty in the visible hop table", () => {
    render(<ResultsView result={sameHostnameResult} mapStyleUrl="about:blank" renderMap={false} />);

    const table = screen.getByRole("table");

    expect(within(table).getAllByText("8.8.8.8")).toHaveLength(1);
  });

  it("deduplicates owner and ISP text while preserving distinct domains", () => {
    render(<ResultsView result={ownerFormattingResult} mapStyleUrl="about:blank" renderMap={false} />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("中国移动 / chinamobileltd.com 移动")).toBeInTheDocument();
    expect(within(table).queryByText("中国移动 / 中国移动 / chinamobileltd.com 移动")).not.toBeInTheDocument();
    expect(within(table).getByText("Cloudflare, Inc. / cloudflare.com")).toBeInTheDocument();
    expect(within(table).getByText("Example ISP")).toBeInTheDocument();

    const emptyOwnerRow = within(table).getByText("192.0.2.4").closest("tr");
    expect(emptyOwnerRow).not.toBeNull();
    expect(within(emptyOwnerRow!).getByText("-")).toBeInTheDocument();
  });

  it("renders a close action when provided", () => {
    const onClose = vi.fn();
    render(<ResultsView result={sampleResult} mapStyleUrl="about:blank" renderMap={false} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "关闭结果" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("copies the share URL without rendering an open action", async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: clipboard });
    render(<ResultsView result={sampleResult} mapStyleUrl="about:blank" renderMap={false} />);

    expect(screen.queryByRole("link", { name: "打开" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    await waitFor(() => {
      expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("measurement=m123"));
    });
    expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument();
  });

  it("switches between probe result tabs", () => {
    render(<ResultsView result={multiProbeResult} mapStyleUrl="about:blank" renderMap={false} />);

    expect(screen.getByText("Los Angeles")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Tokyo/ }));

    expect(screen.getByText("203.0.113.9")).toBeInTheDocument();
    expect(screen.getByText("AS64500")).toBeInTheDocument();
  });

  it("updates target metrics when the active probe changes", () => {
    render(<ResultsView result={multiProbeResult} mapStyleUrl="about:blank" renderMap={false} />);

    expectSummaryMetric("目标延迟", "1.2 ms");
    expectSummaryMetric("目标丢包", "0.0%");

    fireEvent.click(screen.getByRole("tab", { name: /Tokyo/ }));

    expectSummaryMetric("目标延迟", "8.0 ms");
    expectSummaryMetric("目标丢包", "12.5%");
  });

  it("renders N/A target latency when the destination is fully lost", () => {
    render(<ResultsView result={targetLossResult} mapStyleUrl="about:blank" renderMap={false} />);

    expectSummaryMetric("目标延迟", "N/A");
    expectSummaryMetric("目标丢包", "100.0%");
  });

  it("renders N/A target metrics without a usable destination hop", () => {
    render(<ResultsView result={targetMetricFallbackResult} mapStyleUrl="about:blank" renderMap={false} />);

    expectSummaryMetric("目标延迟", "N/A");
    expectSummaryMetric("目标丢包", "N/A");

    fireEvent.click(screen.getByRole("tab", { name: /No match/ }));
    expectSummaryMetric("目标延迟", "N/A");
    expectSummaryMetric("目标丢包", "N/A");

    fireEvent.click(screen.getByRole("tab", { name: /No stats/ }));
    expectSummaryMetric("目标延迟", "N/A");
    expectSummaryMetric("目标丢包", "N/A");
  });

  it("renders raw and whois detail payloads", () => {
    render(<ResultsView result={sampleResult} mapStyleUrl="about:blank" renderMap={false} />);

    fireEvent.click(screen.getByText("raw output"));
    fireEvent.click(screen.getByText("whois / source details"));

    expect(screen.getByText("Host Loss% Avg")).toBeInTheDocument();
    expect(screen.getByText(/google-whois/)).toBeInTheDocument();
    expect(screen.getByText(/8.8.8.0\/24/)).toBeInTheDocument();
    expect(screen.getByText(/"source": "mock"/)).toBeInTheDocument();
  });

  it("renders in-progress polling and no-hop states", () => {
    render(<ResultsView result={inProgressResult} mapStyleUrl="about:blank" renderMap={false} />);

    expect(screen.getByText("measurement 正在运行，轮询完成后会补齐 hop 和 GeoIP。")).toBeInTheDocument();
    expect(screen.getByText("GeoIP: 跳过")).toBeInTheDocument();
    expect(screen.getByText("该 probe 还没有 hop 数据。")).toBeInTheDocument();
  });

  it("surfaces partial enrichment batch errors", () => {
    render(<ResultsView result={partialResult} mapStyleUrl="about:blank" renderMap={false} />);

    expect(screen.getByText("GeoIP: 部分完成")).toBeInTheDocument();
    expect(screen.getByText("1 batch error")).toBeInTheDocument();
  });

  it("fits the result map to the active probe and hop GeoIP points", async () => {
    render(<ResultsView result={sampleResult} mapStyleUrl="about:blank" />);
    const map = await latestMap();

    act(() => map.triggerLoad());

    expect(map.layers.map((layer) => layer.id)).toContain("result-hop-labels");
    expect(map.fitBoundsCalls.at(-1)).toEqual([
      [
        [-122.08, 34.05],
        [-118.24, 37.39],
      ],
      expect.objectContaining({ maxZoom: 5.8 }),
    ]);
  });

  it("updates result map data and view without rebuilding when active probe changes", async () => {
    render(<ResultsView result={multiProbeResult} mapStyleUrl="about:blank" />);
    const map = await latestMap();
    act(() => map.triggerLoad());
    map.easeToCalls.length = 0;

    fireEvent.click(screen.getByRole("tab", { name: /Tokyo/ }));

    await waitFor(() => {
      expect(map.sources.get("result")?.setDataCalls.length).toBeGreaterThan(0);
    });
    expect(maplibreMock.FakeMap.instances).toHaveLength(1);
    expect(map.removeCalls).toHaveLength(0);
    expect(map.easeToCalls.at(-1)).toMatchObject({
      center: [139.76, 35.68],
      zoom: 5,
    });
  });

  it("selects merged table rows and opens a popup when a map hop is clicked", async () => {
    const scrollIntoView = mockScrollIntoView();
    render(<ResultsView result={routeQualityResult} mapStyleUrl="about:blank" />);
    const map = await latestMap();
    act(() => map.triggerLoad());

    act(() => map.triggerLayerClick("result-points", { kind: "hop", nodeId: "route-node-1-2" }));

    const row1 = rowForText("203.0.113.1");
    const row2 = rowForText("203.0.113.2");
    const row5 = rowForText("203.0.113.5");
    await waitFor(() => expect(row1).toHaveClass("selected"));
    expect(row2).toHaveClass("selected");
    expect(row5).not.toHaveClass("selected");
    expect(scrollIntoView).toHaveBeenCalled();
    expect(map.setFilterCalls.at(-1)).toEqual(["result-selected-hop", ["all", ["==", ["get", "kind"], "hop"], ["==", ["get", "nodeId"], "route-node-1-2"]]]);
    expect(maplibreMock.FakePopup.instances.at(-1)?.setHTMLCalls.at(-1)).toContain("TTL 1-2");
  });

  it("selects the merged map point and pans when a linked table row is clicked", async () => {
    mockScrollIntoView();
    render(<ResultsView result={routeQualityResult} mapStyleUrl="about:blank" />);
    const map = await latestMap();
    act(() => map.triggerLoad());

    fireEvent.click(rowForText("203.0.113.2"));

    const row1 = rowForText("203.0.113.1");
    const row2 = rowForText("203.0.113.2");
    await waitFor(() => expect(row2).toHaveClass("selected"));
    expect(row1).toHaveClass("selected");
    expect(map.easeToCalls.at(-1)).toMatchObject({
      center: [-122.08, 37.39],
      duration: 420,
    });
    expect(maplibreMock.FakePopup.instances.at(-1)?.setHTMLCalls.at(-1)).toContain("TTL 1-2");
  });

  it("does not pan the map for table rows without drawable GeoIP", async () => {
    mockScrollIntoView();
    render(<ResultsView result={routeQualityResult} mapStyleUrl="about:blank" />);
    const map = await latestMap();
    act(() => map.triggerLoad());
    fireEvent.click(rowForText("203.0.113.2"));
    await waitFor(() => expect(rowForText("203.0.113.2")).toHaveClass("selected"));
    const easeCallsAfterLinkedClick = map.easeToCalls.length;

    const invalidRow = rowForText("203.0.113.3");
    expect(invalidRow).not.toHaveClass("map-linked");
    fireEvent.click(invalidRow);

    await waitFor(() => expect(rowForText("203.0.113.2")).not.toHaveClass("selected"));
    expect(map.easeToCalls).toHaveLength(easeCallsAfterLinkedClick);
  });

  it("clears selected route node when the active probe changes", async () => {
    mockScrollIntoView();
    render(<ResultsView result={multiProbeResult} mapStyleUrl="about:blank" />);
    const map = await latestMap();
    act(() => map.triggerLoad());
    fireEvent.click(rowForText("8.8.8.8"));
    await waitFor(() => expect(rowForText("8.8.8.8")).toHaveClass("selected"));

    fireEvent.click(screen.getByRole("tab", { name: /Tokyo/ }));

    await waitFor(() => {
      expect(map.setFilterCalls.at(-1)).toEqual(["result-selected-hop", ["all", ["==", ["get", "kind"], "hop"], ["==", ["get", "nodeId"], "__none__"]]]);
    });
  });

  it("builds route map data with filtered, merged, and numbered hop points", () => {
    const active = routeQualityResult.results[0];
    const data = buildResultMapData(active, routeQualityResult.results);
    const line = lineCoordinates(data.featureCollection);
    const labels = hopLabels(data.featureCollection);

    expect(labels).toEqual(["1-2", "5"]);
    expect(data.routeNodes[0]).toMatchObject({ nodeId: "route-node-1-2", ttlList: [1, 2], label: "1-2" });
    expect(data.routeNodeIdByTtl.get(2)).toBe("route-node-1-2");
    expect(line).toEqual([
      [-122.08, 37.39],
      [-0.12, 51.5],
    ]);
    expect(data.fitCoordinates).toContainEqual([-118.24, 34.05]);
  });

  it("normalizes antimeridian route coordinates for the short path", () => {
    const active = antimeridianResult.results[0];
    const data = buildResultMapData(active, antimeridianResult.results);
    const line = lineCoordinates(data.featureCollection);

    expect(hopLabels(data.featureCollection)).toEqual(["1", "2", "4-5"]);
    expect(line).toEqual([
      [179.4, 10],
      [180.7, 11],
      [181.1, 12],
    ]);
    expect(lngSpan(line)).toBeLessThan(3);
    expect(lngSpan(data.fitCoordinates)).toBeLessThan(3);
  });
});

async function latestMap(): Promise<InstanceType<typeof maplibreMock.FakeMap>> {
  await waitFor(() => expect(maplibreMock.FakeMap.instances.length).toBeGreaterThan(0));
  const map = maplibreMock.FakeMap.instances.at(-1);
  if (!map) throw new Error("map was not created");
  return map;
}

function rowForText(text: string): HTMLTableRowElement {
  const row = screen.getByText(text).closest("tr");
  if (!row) throw new Error(`row not found for ${text}`);
  return row as HTMLTableRowElement;
}

function mockScrollIntoView() {
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  return scrollIntoView;
}

function expectSummaryMetric(label: string, value: string) {
  const summary = screen.getByLabelText("trace summary");
  const metric = within(summary).getByText(label).closest(".metric");
  if (!metric) throw new Error(`metric not found for ${label}`);
  expect(within(metric as HTMLElement).getByText(value)).toBeInTheDocument();
}

function hopLabels(collection: ReturnType<typeof buildResultMapData>["featureCollection"]): string[] {
  return collection.features
    .filter((feature) => feature.properties?.kind === "hop")
    .map((feature) => String(feature.properties?.label));
}

function lineCoordinates(collection: ReturnType<typeof buildResultMapData>["featureCollection"]): number[][] {
  const feature = collection.features.find((item) => item.properties?.kind === "path");
  return (feature?.geometry as { coordinates?: number[][] } | undefined)?.coordinates || [];
}

function lngSpan(coordinates: number[][]): number {
  const lngs = coordinates.map((coordinate) => coordinate[0]);
  return Math.max(...lngs) - Math.min(...lngs);
}

function hopWithGeo(
  ttl: number,
  ip: string,
  lat: number,
  lng: number,
  geo: Partial<NonNullable<TraceHop["geo"]>> = {},
): TraceHop {
  return {
    ttl,
    ip,
    hostname: ip,
    asn: [64500],
    timingsMs: [ttl],
    stats: { min: ttl, avg: ttl, max: ttl, total: 1, rcv: 1, drop: 0, loss: 0 },
    geo: {
      ip,
      asnumber: "AS64500",
      lat,
      lng,
      source: "mock",
      ...geo,
    },
  };
}

const sampleResult: TraceResultResponse = {
  measurementId: "m123",
  type: "mtr",
  target: "example.com",
  status: "finished",
  probesCount: 1,
  results: [
    {
      id: "probe-1",
      probe: {
        continent: "NA",
        region: "Northern America",
        country: "US",
        state: "CA",
        city: "Los Angeles",
        asn: 7922,
        latitude: 34.05,
        longitude: -118.24,
        network: "Comcast",
        tags: ["eyeball-network"],
        resolvers: [],
      },
      status: "finished",
      resolvedAddress: "8.8.8.8",
      resolvedHostname: "dns.google",
      rawOutput: "Host Loss% Avg",
      hops: [
        {
          ttl: 1,
          ip: "8.8.8.8",
          hostname: "dns.google",
          asn: [15169],
          timingsMs: [1.2],
          stats: { min: 1, avg: 1.2, max: 2, total: 1, rcv: 1, drop: 0, loss: 0 },
          geo: {
            ip: "8.8.8.8",
            asnumber: "AS15169",
            owner: "Google LLC",
            isp: "Google",
            country: "美国",
            prov: "加利福尼亚",
            city: "山景城",
            country_en: "United States",
            prov_en: "California",
            city_en: "Mountain View",
            whois: "google-whois",
            lat: 37.39,
            lng: -122.08,
            prefix: "8.8.8.0/24",
            source: "mock",
          },
        },
      ],
    },
  ],
  enrichment: { status: "complete", cached: 0, fetched: 1, errors: [] },
};

const englishOnlyRegionResult: TraceResultResponse = {
  ...sampleResult,
  measurementId: "m-english-region",
  results: [
    {
      ...sampleResult.results[0],
      hops: [
        {
          ...sampleResult.results[0].hops[0],
          geo: {
            ...sampleResult.results[0].hops[0].geo!,
            country: undefined,
            prov: undefined,
            city: undefined,
          },
        },
      ],
    },
  ],
};

const sameHostnameResult: TraceResultResponse = {
  ...sampleResult,
  measurementId: "m-same-hostname",
  results: [
    {
      ...sampleResult.results[0],
      hops: [
        {
          ...sampleResult.results[0].hops[0],
          hostname: "8.8.8.8",
        },
      ],
    },
  ],
};

const ownerFormattingResult: TraceResultResponse = {
  ...sampleResult,
  measurementId: "m-owner-formatting",
  results: [
    {
      ...sampleResult.results[0],
      hops: [
        hopWithGeo(1, "192.0.2.1", 39.9, 116.4, {
          country: "中国",
          owner: "中国移动",
          isp: " 中国移动 ",
          domain: "chinamobileltd.com 移动",
        }),
        hopWithGeo(2, "192.0.2.2", 37.7, -122.4, {
          country_en: "United States",
          owner: "Cloudflare, Inc.",
          isp: "cloudflare, inc.",
          domain: "cloudflare.com",
        }),
        hopWithGeo(3, "192.0.2.3", 37.7, -122.4, {
          country_en: "United States",
          owner: " ",
          isp: "Example ISP",
          domain: "",
        }),
        hopWithGeo(4, "192.0.2.4", 37.7, -122.4, {
          country_en: "United States",
          owner: " ",
          isp: "",
          domain: undefined,
        }),
      ],
    },
  ],
};

const targetLossResult: TraceResultResponse = {
  ...sampleResult,
  measurementId: "m-target-loss",
  results: [
    {
      ...sampleResult.results[0],
      resolvedAddress: "198.51.100.2",
      hops: [
        hopWithGeo(1, "198.51.100.1", 37.7, -122.4),
        {
          ...hopWithGeo(2, "198.51.100.2", 37.7, -122.4),
          stats: { min: null, avg: null, max: null, total: 3, rcv: 0, drop: 3, loss: 100 },
        },
      ],
    },
  ],
};

const targetMetricFallbackResult: TraceResultResponse = {
  ...sampleResult,
  measurementId: "m-target-fallback",
  probesCount: 3,
  results: [
    {
      ...sampleResult.results[0],
      id: "probe-no-resolved",
      probe: { ...sampleResult.results[0].probe, city: "No resolved", asn: 64501 },
      resolvedAddress: null,
      hops: [hopWithGeo(1, "198.51.100.3", 37.7, -122.4)],
    },
    {
      ...sampleResult.results[0],
      id: "probe-no-match",
      probe: { ...sampleResult.results[0].probe, city: "No match", asn: 64502 },
      resolvedAddress: "198.51.100.5",
      hops: [hopWithGeo(1, "198.51.100.4", 37.7, -122.4)],
    },
    {
      ...sampleResult.results[0],
      id: "probe-no-stats",
      probe: { ...sampleResult.results[0].probe, city: "No stats", asn: 64503 },
      resolvedAddress: "198.51.100.6",
      hops: [{ ...hopWithGeo(1, "198.51.100.6", 37.7, -122.4), stats: null }],
    },
  ],
};

const inProgressResult: TraceResultResponse = {
  measurementId: "m124",
  type: "mtr",
  target: "example.net",
  status: "in-progress",
  probesCount: 1,
  results: [
    {
      id: "probe-1",
      probe: {
        continent: "NA",
        region: "Northern America",
        country: "US",
        state: "CA",
        city: "Los Angeles",
        asn: 7922,
        latitude: 34.05,
        longitude: -118.24,
        network: "Comcast",
        tags: ["eyeball-network"],
        resolvers: [],
      },
      status: "in-progress",
      resolvedAddress: null,
      resolvedHostname: null,
      rawOutput: "",
      hops: [],
    },
  ],
  enrichment: { status: "skipped", cached: 0, fetched: 0, errors: [] },
};

const partialResult: TraceResultResponse = {
  ...sampleResult,
  measurementId: "m125",
  enrichment: {
    status: "partial",
    cached: 3,
    fetched: 64,
    errors: [{ ips: ["203.0.113.1"], message: "nxtrace batch failed" }],
  },
};

const routeQualityResult: TraceResultResponse = {
  ...sampleResult,
  measurementId: "m-route-quality",
  results: [
    {
      ...sampleResult.results[0],
      hops: [
        hopWithGeo(1, "203.0.113.1", 37.39, -122.08, {
          country_en: "United States",
          prov_en: "California",
          city_en: "Mountain View",
        }),
        hopWithGeo(2, "203.0.113.2", 37.39, -122.08, {
          country_en: "United States",
          prov_en: "California",
          city_en: "Mountain View",
        }),
        hopWithGeo(3, "203.0.113.3", 0, 0, {
          country_en: "United States",
          prov_en: "California",
          city_en: "Null Island",
        }),
        hopWithGeo(4, "203.0.113.4", 39, -98, {
          country_en: "United States",
          prov_en: "",
          city_en: "",
        }),
        hopWithGeo(5, "203.0.113.5", 51.5, -0.12, {
          country_en: "United Kingdom",
          city_en: "London",
        }),
      ],
    },
  ],
};

const antimeridianResult: TraceResultResponse = {
  ...sampleResult,
  measurementId: "m-antimeridian",
  results: [
    {
      ...sampleResult.results[0],
      probe: {
        ...sampleResult.results[0].probe,
        city: "Apia",
        latitude: 10.5,
        longitude: -179.4,
      },
      hops: [
        hopWithGeo(1, "203.0.113.11", 10, 179.4, { country_en: "Fiji", city_en: "East" }),
        hopWithGeo(2, "203.0.113.12", 11, -179.3, { country_en: "Fiji", city_en: "West" }),
        hopWithGeo(3, "203.0.113.13", 0, 0, { country_en: "Fiji", city_en: "Invalid" }),
        hopWithGeo(4, "203.0.113.14", 12, -178.9, { country_en: "Fiji", city_en: "West 2" }),
        hopWithGeo(5, "203.0.113.15", 12, -178.9, { country_en: "Fiji", city_en: "West 2" }),
      ],
    },
  ],
};

const multiProbeResult: TraceResultResponse = {
  ...sampleResult,
  results: [
    sampleResult.results[0],
    {
      id: "probe-2",
      probe: {
        continent: "AS",
        region: "Eastern Asia",
        country: "JP",
        state: null,
        city: "Tokyo",
        asn: 64500,
        latitude: 35.68,
        longitude: 139.76,
        network: "ExampleNet",
        tags: ["datacenter-network"],
        resolvers: [],
      },
      status: "finished",
      resolvedAddress: "203.0.113.9",
      resolvedHostname: "edge.example",
      rawOutput: "tokyo raw",
      hops: [
        {
          ttl: 1,
          ip: "203.0.113.9",
          hostname: "edge.example",
          asn: [64500],
          timingsMs: [8],
          stats: { min: 7, avg: 8, max: 9, total: 8, rcv: 7, drop: 1, loss: 12.5 },
        },
      ],
    },
  ],
};
