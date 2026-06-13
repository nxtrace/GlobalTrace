import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPacketFeatureCollection, buildResultMapData, ResultsView } from "./ResultsView";
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
    readonly setPaintPropertyCalls: unknown[] = [];
    readonly setProjectionCalls: unknown[] = [];
    readonly options: Record<string, unknown>;
    readonly canvas: HTMLElement;

    constructor(options: { container: HTMLElement } & Record<string, unknown>) {
      FakeMap.instances.push(this);
      this.options = options;
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

    setProjection(projection: unknown) {
      this.setProjectionCalls.push(projection);
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

    setPaintProperty(...args: unknown[]) {
      this.setPaintPropertyCalls.push(args);
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
    expectGeoIpMetric("完成", "cache 0 · fetch 1");
    expect(screen.queryByText("GeoIP: 完成")).not.toBeInTheDocument();
    expect(within(table).getByText("8.8.8.8")).toBeInTheDocument();
    expect(within(table).getByText("dns.google")).toBeInTheDocument();
    expect(within(table).getByText("AS15169")).toBeInTheDocument();
    expect(within(table).getByText("Google LLC / Google")).toBeInTheDocument();
    expect(within(table).getByText("美国，加利福尼亚，山景城")).toBeInTheDocument();
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

  it("renders peer.as links for table IPs without selecting the hop", () => {
    render(<ResultsView result={sampleResult} mapStyleUrl="about:blank" renderMap={false} />);

    const link = screen.getByRole("link", { name: "在 peer.as 查看 8.8.8.8" });
    expect(link).toHaveAttribute("href", "https://peer.as/?q=8.8.8.8");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    const row = rowForText("8.8.8.8");
    fireEvent.click(link);
    fireEvent.keyDown(link, { key: "Enter" });

    expect(row).not.toHaveClass("selected");
  });

  it("falls back to English GeoIP fields when Chinese fields are absent", () => {
    render(<ResultsView result={englishOnlyRegionResult} mapStyleUrl="about:blank" renderMap={false} />);

    expect(within(screen.getByRole("table")).getByText("United States，California，Mountain View")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    await waitFor(() => {
      expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("measurement=m123"));
    });
    expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument();
  });

  it("switches between probe result tabs", () => {
    render(<ResultsView result={multiProbeResult} mapStyleUrl="about:blank" renderMap={false} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]?.querySelector(".probe-tab-route-dot")).not.toBeNull();
    expect((tabs[0] as HTMLElement).style.getPropertyValue("--route-color")).toBe("#14b8a6");
    expect((tabs[1] as HTMLElement).style.getPropertyValue("--route-color")).toBe("#f97316");
    expect(screen.getByText("Los Angeles")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Tokyo/ }));

    const table = screen.getByRole("table");
    expect(within(table).getByText("203.0.113.9")).toBeInTheDocument();
    expect(within(table).getByText("AS64500")).toBeInTheDocument();
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

  it("keeps mobile hop cards wired to hop selection", async () => {
    render(<ResultsView result={sampleResult} mapStyleUrl="about:blank" renderMap={false} />);

    const card = screen.getByText("TTL 1").closest("button");
    expect(card).not.toBeNull();
    fireEvent.click(card!);

    await waitFor(() => expect(card).toHaveClass("selected"));
    expect(screen.getByLabelText("hop details")).toContainElement(card);
  });

  it("renders in-progress polling and no-hop states", () => {
    render(<ResultsView result={inProgressResult} mapStyleUrl="about:blank" renderMap={false} />);

    expect(screen.getByText("measurement 正在运行，轮询完成后会补齐 hop 和 GeoIP。")).toBeInTheDocument();
    expectGeoIpMetric("跳过", "cache 0 · fetch 0");
    expect(screen.getByText("该 probe 还没有 hop 数据。")).toBeInTheDocument();
  });

  it("surfaces partial enrichment batch errors", () => {
    render(<ResultsView result={partialResult} mapStyleUrl="about:blank" renderMap={false} />);

    expectGeoIpMetric("部分完成", "cache 3 · fetch 64");
    expect(screen.getByText("1 IP 失败: nxtrace batch failed")).toBeInTheDocument();
  });

  it("shows failed probe counts and raw failure reason", () => {
    render(<ResultsView result={failedProbeResult} mapStyleUrl="about:blank" renderMap={false} />);

    expectSummaryMetric("probes", "1/2");
    expectSummaryMetric("失败 probes", "1");
    fireEvent.click(screen.getByRole("tab", { name: /Ningbo/ }));
    expect(screen.getByText("该 probe 失败：Private IP ranges are not allowed.")).toBeInTheDocument();
  });

  it("renders the result map projection switch and reports changes", () => {
    const onMapProjectionChange = vi.fn();
    render(
      <ResultsView
        result={sampleResult}
        mapStyleUrl="about:blank"
        mapProjection="globe"
        renderMap={false}
        onMapProjectionChange={onMapProjectionChange}
      />,
    );

    expect(screen.queryByRole("group", { name: "结果地图视图" })).not.toBeInTheDocument();

    cleanup();
    render(
      <ResultsView
        result={sampleResult}
        mapStyleUrl="about:blank"
        mapProjection="globe"
        onMapProjectionChange={onMapProjectionChange}
        onClose={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole("group", { name: "结果地图视图" });
    const headerActions = toolbar.closest(".result-header-actions") as HTMLElement;
    expect(headerActions).not.toBeNull();
    expect(headerActions.firstElementChild).toBe(toolbar);
    const copyButton = within(headerActions).getByRole("button", { name: "分享" });
    const closeButton = within(headerActions).getByRole("button", { name: "关闭结果" });
    const twoDimensionalButton = screen.getByRole("button", { name: "切换结果地图到 2D" });
    const threeDimensionalButton = screen.getByRole("button", { name: "切换结果地图到 3D" });
    expect(headerActions.children[1]).toBe(copyButton);
    expect(headerActions.children[2]).toBe(closeButton);
    expect(copyButton).toHaveClass("result-command-button");
    expect(closeButton).toHaveClass("result-command-button");
    expect(twoDimensionalButton).toHaveClass("result-view-button");
    expect(threeDimensionalButton).toHaveClass("result-view-button");
    expect(twoDimensionalButton).not.toHaveClass("result-command-button");
    expect(threeDimensionalButton).not.toHaveClass("result-command-button");
    expect(threeDimensionalButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "切换结果地图到 2D" }));

    expect(onMapProjectionChange).toHaveBeenCalledWith("mercator");
  });

  it("fits the result map to the active probe and hop GeoIP points", async () => {
    render(<ResultsView result={sampleResult} mapStyleUrl="about:blank" />);
    const map = await latestMap();

    act(() => map.triggerLoad());

    expect(map.layers.map((layer) => layer.id)).toContain("result-hop-labels");
    expect(map.layers.map((layer) => layer.id)).toEqual(expect.arrayContaining(["result-packets", "result-endpoint-shadow", "result-endpoint-halo", "result-endpoint-core"]));
    expect(map.sources.get("result-packets")?.data).toMatchObject({ type: "FeatureCollection" });
    expect(map.layers.find((layer) => layer.id === "result-line")?.layout).toMatchObject({
      "line-sort-key": ["case", ["boolean", ["get", "active"], false], 1, 0],
    });
    expect(map.layers.find((layer) => layer.id === "result-line")?.paint).toMatchObject({
      "line-width": ["case", ["boolean", ["get", "active"], false], 2.9, 1.25],
      "line-opacity": ["case", ["boolean", ["get", "active"], false], 0.86, 0.18],
      "line-blur": 0,
    });
    expect(map.layers.find((layer) => layer.id === "result-packets")?.paint).toMatchObject({
      "circle-radius": ["case", ["boolean", ["get", "active"], false], 3, 2],
      "circle-stroke-width": ["case", ["boolean", ["get", "active"], false], 0.8, 0.4],
    });
    expect(map.layers.find((layer) => layer.id === "result-points")?.paint).toMatchObject({
      "circle-radius": ["case", ["boolean", ["get", "active"], false], 14, 10],
      "circle-color": ["coalesce", ["get", "color"], "#587f78"],
    });
    expect(map.layers.find((layer) => layer.id === "result-selected-hop")?.paint).toMatchObject({ "circle-radius": 19 });
    expect(screen.getByLabelText("trace result map")).toHaveAttribute("data-map-projection", "mercator");
    expect(screen.getByLabelText("trace result map")).not.toHaveClass("result-map-globe");
    expect(map.fitBoundsCalls.at(-1)).toEqual([
      [
        [-122.08, 34.05],
        [-118.24, 37.39],
      ],
      expect.objectContaining({
        padding: { top: 38, right: 38, bottom: 38, left: 38 },
        maxZoom: 5.8,
      }),
    ]);
    expect(map.setProjectionCalls).toEqual([{ type: "mercator" }]);
  });

  it("uses globe projection and fluorescent result overlay styles", async () => {
    render(<ResultsView result={sampleResult} mapStyleUrl="about:blank" mapProjection="globe" />);
    const map = await latestMap();

    act(() => map.triggerLoad());

    expect(map.options).toMatchObject({ aroundCenter: true });
    expect(map.setProjectionCalls).toEqual([{ type: "globe" }]);
    expect(screen.getByLabelText("trace result map")).toHaveClass("result-map-globe");
    expect(screen.getByLabelText("trace result map")).toHaveAttribute("data-map-projection", "globe");
    expect(map.fitBoundsCalls.at(-1)).toEqual([
      [
        [-122.08, 34.05],
        [-118.24, 37.39],
      ],
      expect.objectContaining({
        padding: { top: 96, right: 120, bottom: 96, left: 120 },
        maxZoom: 4.4,
      }),
    ]);
    expect(map.layers.find((layer) => layer.id === "result-line-glow")?.layout).toMatchObject({
      "line-sort-key": ["case", ["boolean", ["get", "active"], false], 1, 0],
    });
    expect(map.layers.find((layer) => layer.id === "result-line-glow")?.paint).toMatchObject({
      "line-color": ["coalesce", ["get", "color"], "#587f78"],
      "line-width": ["case", ["boolean", ["get", "active"], false], 10, 3.8],
      "line-opacity": ["case", ["boolean", ["get", "active"], false], 0.4, 0.07],
      "line-blur": 3.2,
    });
    expect(map.layers.find((layer) => layer.id === "result-line")?.layout).toMatchObject({
      "line-sort-key": ["case", ["boolean", ["get", "active"], false], 1, 0],
    });
    expect(map.layers.find((layer) => layer.id === "result-line")?.paint).toMatchObject({
      "line-color": ["coalesce", ["get", "color"], "#587f78"],
      "line-width": ["case", ["boolean", ["get", "active"], false], 5.4, 2.1],
      "line-opacity": ["case", ["boolean", ["get", "active"], false], 1, 0.2],
      "line-blur": 0.4,
    });
    expect(map.layers.find((layer) => layer.id === "result-endpoint-core")?.paint).toMatchObject({
      "circle-color": ["coalesce", ["get", "color"], "#587f78"],
      "circle-opacity": ["case", ["boolean", ["get", "active"], false], 1, 0.58],
    });
  });

  it("updates globe result map data and view without rebuilding when active probe changes", async () => {
    render(<ResultsView result={multiProbeResult} mapStyleUrl="about:blank" mapProjection="globe" />);
    const map = await latestMap();
    act(() => map.triggerLoad());
    map.easeToCalls.length = 0;

    fireEvent.click(screen.getByRole("tab", { name: /Tokyo/ }));

    await waitFor(() => {
      expect(map.sources.get("result")?.setDataCalls.length).toBeGreaterThan(0);
    });
    expect(maplibreMock.FakeMap.instances).toHaveLength(1);
    expect(map.removeCalls).toHaveLength(0);
    expect(map.setProjectionCalls).toEqual([{ type: "globe" }]);
    expect(map.easeToCalls.at(-1)).toMatchObject({
      center: [139.76, 35.68],
      zoom: 4.2,
    });
  });

  it("selects merged table rows in globe mode when a map hop or label is clicked", async () => {
    const scrollIntoView = mockScrollIntoView();
    render(<ResultsView result={routeQualityResult} mapStyleUrl="about:blank" mapProjection="globe" />);
    const map = await latestMap();
    act(() => map.triggerLoad());

    act(() => map.triggerLayerClick("result-points", { kind: "hop", nodeId: "route-0-node-1-2", routeIndex: 0 }));

    const row1 = rowForText("203.0.113.1");
    const row2 = rowForText("203.0.113.2");
    const row5 = rowForText("203.0.113.5");
    await waitFor(() => expect(row1).toHaveClass("selected"));
    expect(row2).toHaveClass("selected");
    expect(row5).not.toHaveClass("selected");
    expect(scrollIntoView).toHaveBeenCalled();
    expect(map.setFilterCalls.at(-1)).toEqual(["result-selected-hop", ["all", ["==", ["get", "kind"], "hop"], ["==", ["get", "nodeId"], "route-0-node-1-2"]]]);
    expect(maplibreMock.FakePopup.instances.at(-1)?.setHTMLCalls.at(-1)).toContain("TTL 1-2");

    act(() => map.triggerLayerClick("result-hop-labels", { kind: "hop", nodeId: "route-0-node-5", routeIndex: 0 }));

    await waitFor(() => expect(row5).toHaveClass("selected"));
    expect(row1).not.toHaveClass("selected");
    expect(row2).not.toHaveClass("selected");
    expect(map.setFilterCalls.at(-1)).toEqual(["result-selected-hop", ["all", ["==", ["get", "kind"], "hop"], ["==", ["get", "nodeId"], "route-0-node-5"]]]);
    expect(maplibreMock.FakePopup.instances.at(-1)?.setHTMLCalls.at(-1)).toContain("TTL 5");
  });

  it("selects the merged globe map point and pans when a linked table row is clicked", async () => {
    mockScrollIntoView();
    render(<ResultsView result={routeQualityResult} mapStyleUrl="about:blank" mapProjection="globe" />);
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

  it("builds probe routes with stable colors, endpoints, and distance-based packets", () => {
    const data = buildResultMapData(multiRouteResult.results[0], multiRouteResult.results);
    const paths = pathFeatures(data.featureCollection);
    const hops = data.featureCollection.features.filter((feature) => feature.properties?.kind === "hop");
    const route0Packets = packetFeatures(data.packetFeatureCollection, "route-0");
    const route1Packets = packetFeatures(data.packetFeatureCollection, "route-1");

    expect(data.routes).toHaveLength(2);
    expect(paths).toHaveLength(1);
    expect(paths[0]?.properties).toMatchObject({ routeId: "route-1", color: "#f97316", active: false });
    expect(hops.map((feature) => feature.properties?.nodeId)).toEqual([
      "route-0-node-1-2",
      "route-0-node-5",
      "route-1-node-1",
      "route-1-node-2",
    ]);
    expect(hops.filter((feature) => feature.properties?.endpoint).map((feature) => feature.properties?.endpointRole)).toEqual(["start", "end", "start", "end"]);
    expect(route0Packets).toHaveLength(0);
    expect(route1Packets).toHaveLength(1);
    packetDistances(route1Packets).forEach((distance, index, distances) => {
      if (index > 0) expect(distance - distances[index - 1]).toBeCloseTo(1800, 6);
    });
    expect(data.packetFeatureCollection.features[0]?.properties).toMatchObject({ kind: "packet", routeId: "route-1", color: "#f97316", active: false });
    expect(data.routeNodeById.get("route-1-node-2")).toMatchObject({ resultIndex: 1, color: "#f97316" });
  });

  it("moves packets forward at a fixed km speed without reversing the route", () => {
    const data = buildResultMapData(eastboundRouteResult.results[0], eastboundRouteResult.results);
    const initialPacket = packetFeatures(data.packetFeatureCollection, "route-0")[0];
    const movedPackets = packetFeatures(buildPacketFeatureCollection(data.routes, 1000), "route-0");
    const movedPacket = movedPackets[0];

    expect(initialPacket?.geometry).toMatchObject({ coordinates: [1, 0] });
    expect(Number(movedPacket?.properties?.distanceKm)).toBeCloseTo(900, 4);
    const coordinate = (movedPacket?.geometry as { coordinates?: number[] } | undefined)?.coordinates || [];
    expect(coordinate[0]).toBeGreaterThan(1);
    expect(coordinate[0]).toBeLessThan(21);
    expect(coordinate[1]).toBe(0);
  });

  it("uses the shared display path for the visible line and packet coordinates", () => {
    const data = buildResultMapData(projectedCurveRouteResult.results[0], projectedCurveRouteResult.results);
    const line = lineCoordinates(data.featureCollection);
    const movedPacket = packetFeatures(buildPacketFeatureCollection(data.routes, 1000), "route-0")[0];
    const coordinate = (movedPacket?.geometry as { coordinates?: number[] } | undefined)?.coordinates || [];

    expect(line.length).toBeGreaterThan(2);
    expect(coordinateOnProjectedPolyline(coordinate, line)).toBe(true);
    expect(Math.abs(coordinate[1] - (coordinate[0] - 1))).toBeGreaterThan(0.05);
  });

  it("switches to an inactive route when its map point is clicked", async () => {
    const scrollIntoView = mockScrollIntoView();
    render(<ResultsView result={multiRouteResult} mapStyleUrl="about:blank" mapProjection="globe" />);
    const map = await latestMap();
    act(() => map.triggerLoad());

    act(() => map.triggerLayerClick("result-points", { kind: "hop", nodeId: "route-1-node-1", routeIndex: 1 }));

    await waitFor(() => expect(screen.getByRole("tab", { name: /Tokyo/ })).toHaveAttribute("aria-selected", "true"));
    const row = rowForText("198.51.100.10");
    expect(row).toHaveClass("selected");
    expect(scrollIntoView).toHaveBeenCalled();
    expect(map.setFilterCalls.at(-1)).toEqual(["result-selected-hop", ["all", ["==", ["get", "kind"], "hop"], ["==", ["get", "nodeId"], "route-1-node-1"]]]);
    expect(maplibreMock.FakePopup.instances.at(-1)?.setHTMLCalls.at(-1)).toContain("TTL 1");
  });

  it("builds route map data with filtered, merged, and numbered hop points", () => {
    const active = routeQualityResult.results[0];
    const data = buildResultMapData(active, routeQualityResult.results);
    const paths = pathFeatures(data.featureCollection);
    const labels = hopLabels(data.featureCollection);

    expect(labels).toEqual(["1-2", "5"]);
    expect(data.routeNodes[0]).toMatchObject({ nodeId: "route-0-node-1-2", ttlList: [1, 2], label: "1-2" });
    expect(data.routeNodeIdByTtl.get(2)).toBe("route-0-node-1-2");
    expect(paths).toHaveLength(0);
    expect(data.fitCoordinates).toContainEqual([-118.24, 34.05]);
  });

  it("does not connect drawable hops across missing TTL gaps", () => {
    const active = gappedRouteResult.results[0];
    const data = buildResultMapData(active, gappedRouteResult.results);

    expect(hopLabels(data.featureCollection)).toEqual(["6", "15"]);
    expect(pathFeatures(data.featureCollection)).toHaveLength(0);
    expect(packetFeatures(data.packetFeatureCollection, "route-0")).toHaveLength(0);
  });

  it("does not build route paths for failed probes without hops", () => {
    const active = failedProbeResult.results[1];
    const data = buildResultMapData(active, failedProbeResult.results);
    const failedRouteFeatures = data.featureCollection.features.filter((feature) => feature.properties?.routeId === "route-1");

    expect(failedRouteFeatures.filter((feature) => feature.properties?.kind === "probe")).toHaveLength(1);
    expect(failedRouteFeatures.filter((feature) => feature.properties?.kind === "hop")).toHaveLength(0);
    expect(failedRouteFeatures.filter((feature) => feature.properties?.kind === "path")).toHaveLength(0);
  });

  it("normalizes antimeridian route coordinates for the short path", () => {
    const active = antimeridianResult.results[0];
    const data = buildResultMapData(active, antimeridianResult.results);
    const paths = pathFeatures(data.featureCollection);
    const line = lineCoordinates(data.featureCollection);

    expect(hopLabels(data.featureCollection)).toEqual(["1", "2", "4-5"]);
    expect(paths).toHaveLength(1);
    expect(line).toHaveLength(2);
    expect(line[0]).toEqual([179.4, 10]);
    expect(line.at(-1)).toEqual([180.7, 11]);
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
  const row = within(screen.getByRole("table")).getByText(text).closest("tr");
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

function expectGeoIpMetric(status: string, detail: string) {
  const summary = screen.getByLabelText("trace summary");
  const metric = within(summary).getByLabelText("GeoIP enrichment status");
  expect(metric).toHaveClass("metric", "geoip");
  expect(within(metric).getByText("GeoIP")).toBeInTheDocument();
  expect(within(metric).getByText(`${status} · ${detail}`)).toBeInTheDocument();
  expect(summary).toContainElement(metric);
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

function pathFeatures(collection: ReturnType<typeof buildResultMapData>["featureCollection"]) {
  return collection.features.filter((item) => item.properties?.kind === "path");
}

function packetFeatures(collection: ReturnType<typeof buildResultMapData>["packetFeatureCollection"], routeId: string) {
  return collection.features.filter((item) => item.properties?.kind === "packet" && item.properties?.routeId === routeId);
}

function packetDistances(features: ReturnType<typeof packetFeatures>): number[] {
  return features.map((feature) => Number(feature.properties?.distanceKm));
}

function lngSpan(coordinates: number[][]): number {
  const lngs = coordinates.map((coordinate) => coordinate[0]);
  return Math.max(...lngs) - Math.min(...lngs);
}

function coordinateOnProjectedPolyline(coordinate: number[], line: number[][]): boolean {
  const point = testProjectWebMercator(coordinate);
  return line.some((start, index) => {
    const end = line[index + 1];
    if (!end) return false;
    const startPoint = testProjectWebMercator(start);
    const endPoint = testProjectWebMercator(end);
    return distanceToProjectedSegment(point, startPoint, endPoint) < 1e-6;
  });
}

function testProjectWebMercator(coordinate: number[]): { x: number; y: number } {
  const lat = (coordinate[1] * Math.PI) / 180;
  return {
    x: (coordinate[0] * Math.PI) / 180,
    y: Math.log(Math.tan(Math.PI / 4 + lat / 2)),
  };
}

function distanceToProjectedSegment(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
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

const failedProbeResult: TraceResultResponse = {
  ...sampleResult,
  measurementId: "m-failed-probe",
  probesCount: 2,
  results: [
    sampleResult.results[0],
    {
      ...sampleResult.results[0],
      id: "probe-failed",
      probe: {
        ...sampleResult.results[0].probe,
        city: "Ningbo",
        asn: 56048,
        latitude: 29.86,
        longitude: 121.55,
        network: "China Mobile",
      },
      status: "failed",
      resolvedAddress: null,
      resolvedHostname: null,
      rawOutput: "Private IP ranges are not allowed.",
      hops: [],
    },
  ],
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

const gappedRouteResult: TraceResultResponse = {
  ...sampleResult,
  measurementId: "m-gapped-route",
  results: [
    {
      ...sampleResult.results[0],
      hops: [
        hopWithGeo(6, "198.51.100.6", 22.54, 114.06, { country_en: "China", prov_en: "Guangdong", city_en: "Shenzhen" }),
        {
          ttl: 7,
          ip: null,
          hostname: null,
          asn: [],
          timingsMs: [],
          stats: { min: 0, avg: 0, max: 0, total: 1, rcv: 0, drop: 1, loss: 100 },
        },
        {
          ...hopWithGeo(8, "198.51.100.8", 0, 0, { country_en: "China" }),
          enrichmentError: "nxtrace batch failed with HTTP 504",
        },
        hopWithGeo(15, "198.51.100.15", 35.68, 139.76, { country_en: "Japan", city_en: "Tokyo" }),
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

const multiRouteResult: TraceResultResponse = {
  ...routeQualityResult,
  measurementId: "m-multi-route",
  probesCount: 2,
  results: [
    routeQualityResult.results[0],
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
      resolvedAddress: "198.51.100.11",
      resolvedHostname: "edge.example",
      rawOutput: "tokyo raw",
      hops: [
        hopWithGeo(1, "198.51.100.10", 35.68, 139.76, { country_en: "Japan", city_en: "Tokyo" }),
        hopWithGeo(2, "198.51.100.11", 22.31, 114.17, { country_en: "Hong Kong", city_en: "Hong Kong" }),
      ],
    },
  ],
};

const eastboundRouteResult: TraceResultResponse = {
  ...sampleResult,
  measurementId: "m-eastbound",
  results: [
    {
      ...sampleResult.results[0],
      hops: [
        hopWithGeo(1, "198.51.100.20", 0, 1, { country_en: "Test", city_en: "Start" }),
        hopWithGeo(2, "198.51.100.21", 0, 21, { country_en: "Test", city_en: "End" }),
      ],
    },
  ],
};

const projectedCurveRouteResult: TraceResultResponse = {
  ...sampleResult,
  measurementId: "m-projected-curve",
  results: [
    {
      ...sampleResult.results[0],
      hops: [
        hopWithGeo(1, "198.51.100.30", 0, 1, { country_en: "Test", city_en: "Start" }),
        hopWithGeo(2, "198.51.100.31", 60, 61, { country_en: "Test", city_en: "End" }),
      ],
    },
  ],
};
