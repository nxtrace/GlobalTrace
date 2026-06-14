import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, ENRICH_AFTER_FINISHED_DELAY_MS, POLL_DELAY_MS, TRACE_MAX_POLL_ATTEMPTS } from "./App";
import { measurementToTraceResponse } from "../shared/transform";
import type { GlobalpingProbe, TraceResultResponse } from "../shared/types";
import type { GlobalpingMeasurement } from "../shared/globalping";

vi.mock("./components/ProbeMap", () => ({
  ProbeMap: (props: {
    probes: GlobalpingProbe[];
    onPickAsn: (selection: { magic: string; city: string; country: string; asn: string; network: string; count: number }) => void;
    onBoxSelect: (probes: GlobalpingProbe[]) => void;
  }) => {
    const pickProbeAt = (index: number) => {
      const probe = props.probes[index];
      if (!probe) return;
      props.onPickAsn({
        magic: `${probe.location.city}+${probe.location.country}+AS${probe.location.asn}`,
        city: probe.location.city,
        country: probe.location.country,
        asn: `AS${probe.location.asn}`,
        network: probe.location.network,
        count: 1,
      });
    };
    return (
      <section aria-label="mock probe map">
        <span>map-probe-count:{props.probes.length}</span>
        <span>probe-projection:mercator</span>
        <span>box:on</span>
        <button type="button" onClick={() => pickProbeAt(0)}>
          pick first probe
        </button>
        <button type="button" onClick={() => pickProbeAt(1)}>
          pick second probe
        </button>
        <button type="button" onClick={() => props.onBoxSelect(repeatProbes(props.probes[0], 12))}>
          box many probes
        </button>
      </section>
    );
  },
}));

vi.mock("./components/ResultsView", () => ({
  ResultsView: ({
    result,
    mapProjection,
    onMapProjectionChange,
    resultContentOrder,
    onClose,
  }: {
    result: TraceResultResponse | null;
    mapProjection?: "mercator" | "globe";
    onMapProjectionChange?: (value: "mercator" | "globe") => void;
    resultContentOrder?: "table-first" | "map-first";
    onClose?: () => void;
  }) => (
    <section aria-label="mock results">
      {result ? `result:${result.status}:${result.measurementId}` : "no result"}
      <span>{`projection:${mapProjection || "mercator"}`}</span>
      <span>{`layout:${resultContentOrder || "table-first"}`}</span>
      <button type="button" aria-pressed={mapProjection === "mercator"} onClick={() => onMapProjectionChange?.("mercator")}>
        切换结果地图到 2D
      </button>
      <button type="button" aria-pressed={mapProjection === "globe"} onClick={() => onMapProjectionChange?.("globe")}>
        切换结果地图到 3D
      </button>
      {onClose && (
        <button type="button" onClick={onClose}>
          关闭结果
        </button>
      )}
    </section>
  ),
}));

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
  window.localStorage.setItem("globaltrace.resultLayout", "table-first");
  setNavigatorDevice({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)", platform: "Linux x86_64" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage?.clear();
  window.sessionStorage?.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("liquid-glass-force-fallback");
  window.history.replaceState(null, "", "/");
});

const openExactFilters = () => {
  const panel = screen.getByText("精确筛选").closest("details") as HTMLDetailsElement | null;
  if (!panel?.open) fireEvent.click(screen.getByText("精确筛选"));
};

const openAdvancedParams = () => {
  fireEvent.click(screen.getByRole("button", { name: "打开高级参数" }));
};

const editTextControl = (label: string, value: string) => {
  const control = screen.getByLabelText(label);
  control.textContent = value;
  fireEvent.input(control);
};

describe("App", () => {
  it("loads config, probes, and anonymous quota on startup", async () => {
    mockApi();

    render(<App />);

    expect(await screen.findByText("2 / 2 probes 匹配")).toBeInTheDocument();
    expect(await screen.findByLabelText("mock probe map")).toBeInTheDocument();
    expect(screen.getByText("probe-projection:mercator")).toBeInTheDocument();
    expect(screen.getByText("box:on")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "切换到 3D 视图" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("mock results")).not.toBeInTheDocument();
    expect(screen.getByText("Globalping credits 控制诊断创建")).toBeInTheDocument();
    expect(screen.getByText("可创建诊断 249/250（当前 IP）")).toBeInTheDocument();
    expect(screen.getByLabelText("magic string")).toHaveValue("");
    expect(screen.getByLabelText("Limit")).toHaveTextContent("3");
    expect(document.documentElement.dataset.theme).toBe("system");
  });

  it("renders the Bing background layer without homepage attribution when available", async () => {
    mockApi({ backgroundImage: bingBackgroundImage() });

    render(<App />);

    expect(await screen.findByText("2 / 2 probes 匹配")).toBeInTheDocument();
    const backgroundLayer = document.querySelector(".ambient-background") as HTMLElement | null;
    expect(backgroundLayer).not.toBeNull();
    expect(document.documentElement).toHaveClass("ambient-photo-ready");
    expect(document.querySelector(".app-shell")).toHaveClass("ambient-photo-ready");
    expect(backgroundLayer?.getAttribute("style")).toContain("--ambient-background-image: url(\"/api/background/image\")");
    expect(screen.queryByText(/背景：岁月的层峦/)).not.toBeInTheDocument();
  });

  it("keeps the app usable when the background request fails", async () => {
    mockApi({ backgroundStatus: 502 });

    render(<App />);

    expect(await screen.findByText("2 / 2 probes 匹配")).toBeInTheDocument();
    expect(document.querySelector(".ambient-background")).toBeNull();
    expect(document.documentElement).not.toHaveClass("ambient-photo-ready");
    expect(document.querySelector(".app-shell")).not.toHaveClass("ambient-photo-ready");

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
  });

  it("keeps probe selection in 2D and persists the result map projection locally", async () => {
    mockApi();

    render(<App />);

    expect(await screen.findByLabelText("mock probe map")).toBeInTheDocument();
    expect(window.localStorage.getItem("globaltrace.viewMode")).toBe("2d");
    expect(screen.queryByRole("button", { name: "切换结果地图到 3D" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    expect(await screen.findByText("result:finished:m123", {}, { timeout: 3_000 })).toBeInTheDocument();
    expect(screen.getByLabelText("mock probe map")).toBeInTheDocument();
    const resultDialog = screen.getByRole("dialog", { name: "诊断结果" });
    expect(resultDialog).toHaveClass("glass-overlay-bare-surface");
    expect(document.querySelector(".glass-overlay-result .glass-overlay-header")).toBeNull();
    expect(document.querySelector(".glass-overlay-result .glass-overlay-body")).toBeNull();
    expect(document.querySelector(".glass-overlay-result .glass-overlay-panel")).toBeNull();
    expect(screen.getByText("projection:mercator")).toBeInTheDocument();
    expect(screen.getByText("layout:table-first")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "切换结果地图到 3D" }));
    expect(screen.getByText("projection:globe")).toBeInTheDocument();
    expect(window.localStorage.getItem("globaltrace.viewMode")).toBe("3d");

    fireEvent.click(screen.getByRole("button", { name: "关闭结果" }));
    expect(await screen.findByLabelText("mock probe map")).toBeInTheDocument();
    expect(screen.getByText("probe-projection:mercator")).toBeInTheDocument();
    expect(screen.getByText("box:on")).toBeInTheDocument();
  });

  it("restores and persists result content order locally", async () => {
    window.localStorage.setItem("globaltrace.resultLayout", "map-first");
    mockApi();

    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    openAdvancedParams();
    expect(screen.getByRole("radio", { name: "地图优先" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "表格优先" }));
    await waitFor(() => {
      expect(window.localStorage.getItem("globaltrace.resultLayout")).toBe("table-first");
    });

    fireEvent.click(screen.getByRole("radio", { name: "地图优先" }));
    await waitFor(() => {
      expect(window.localStorage.getItem("globaltrace.resultLayout")).toBe("map-first");
    });

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    expect(screen.getByText("layout:map-first")).toBeInTheDocument();
  });

  it("asks first-time users to choose the result content order", async () => {
    window.localStorage.removeItem("globaltrace.resultLayout");
    mockApi();

    render(<App />);

    const dialog = screen.getByRole("dialog", { name: "选择结果页显示顺序" });
    expect(within(dialog).getByText("后续如果还想改，可以在高级参数中修改。")).toBeInTheDocument();
    expect(dialog.closest(".glass-overlay-blocking")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "关闭选择结果页显示顺序" })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "选择结果页显示顺序" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "表格优先" }));
    await waitFor(() => {
      expect(window.localStorage.getItem("globaltrace.resultLayout")).toBe("table-first");
    });
    expect(screen.queryByRole("dialog", { name: "选择结果页显示顺序" })).not.toBeInTheDocument();
  });

  it("keeps first-time result order choice above shared result links", async () => {
    window.localStorage.removeItem("globaltrace.resultLayout");
    window.history.replaceState(null, "", "/?measurement=m123");
    mockApi({ traceStatus: () => "finished" });

    render(<App />);

    const initialChoiceDialog = screen.getByRole("dialog", { name: "选择结果页显示顺序" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(initialChoiceDialog).toBeInTheDocument();

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    const resultDialog = screen.getByRole("dialog", { name: "诊断结果" });
    const choiceDialog = screen.getByRole("dialog", { name: "选择结果页显示顺序" });
    expect(resultDialog.closest(".glass-overlay-result")).not.toBeNull();
    expect(choiceDialog.closest(".glass-overlay-blocking")).not.toBeNull();
    expect(screen.getByText("layout:map-first")).toBeInTheDocument();

    fireEvent.click(within(choiceDialog).getByRole("button", { name: "地图优先" }));
    await waitFor(() => {
      expect(window.localStorage.getItem("globaltrace.resultLayout")).toBe("map-first");
    });
    expect(screen.getByText("result:finished:m123")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "选择结果页显示顺序" })).not.toBeInTheDocument();
  });

  it("uses first-time map-first selection for the result page", async () => {
    window.localStorage.removeItem("globaltrace.resultLayout");
    mockApi();

    render(<App />);

    const dialog = screen.getByRole("dialog", { name: "选择结果页显示顺序" });
    fireEvent.click(within(dialog).getByRole("button", { name: "地图优先" }));
    await waitFor(() => {
      expect(window.localStorage.getItem("globaltrace.resultLayout")).toBe("map-first");
    });

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    expect(screen.getByText("layout:map-first")).toBeInTheDocument();
  });

  it.each(["table-first", "map-first"] as const)(
    "does not ask for result content order when %s is stored",
    async (storedOrder) => {
      window.localStorage.setItem("globaltrace.resultLayout", storedOrder);
      mockApi();

      render(<App />);

      await screen.findByText("2 / 2 probes 匹配");
      expect(screen.queryByRole("dialog", { name: "选择结果页显示顺序" })).not.toBeInTheDocument();
    },
  );

  it("persists theme mode locally", async () => {
    mockApi();

    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(screen.getByRole("button", { name: "主题：System" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });
    expect(window.localStorage.getItem("globaltrace.themeMode")).toBe("light");

    fireEvent.click(screen.getByRole("button", { name: "主题：Light" }));
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
  });

  it("restores and persists advanced trace port and packets locally", async () => {
    window.localStorage.setItem("globaltrace.tracePort", "443");
    window.localStorage.setItem("globaltrace.tracePackets", "9");
    const fetchMock = mockApi();

    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    openAdvancedParams();
    expect(screen.getByLabelText("端口")).toHaveTextContent("443");
    expect(screen.getByLabelText("Packets")).toHaveTextContent("9");

    editTextControl("端口", "8443");
    editTextControl("Packets", "7");

    await waitFor(() => {
      expect(window.localStorage.getItem("globaltrace.tracePort")).toBe("8443");
      expect(window.localStorage.getItem("globaltrace.tracePackets")).toBe("7");
    });

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    expect(traceCreateBodies(fetchMock)[0].measurementOptions).toMatchObject({ port: 8443, packets: 7 });
  });

  it("falls back from invalid stored packets and reset clears stored trace parameters", async () => {
    window.localStorage.setItem("globaltrace.tracePort", "443");
    window.localStorage.setItem("globaltrace.tracePackets", "99");
    mockApi();

    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    openAdvancedParams();
    expect(screen.getByLabelText("端口")).toHaveTextContent("443");
    expect(screen.getByLabelText("Packets")).toHaveTextContent("5");

    fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));

    expect(screen.getByLabelText("端口")).toHaveTextContent("");
    expect(screen.getByLabelText("Packets")).toHaveTextContent("5");
    expect(window.localStorage.getItem("globaltrace.tracePort")).toBeNull();
    expect(window.localStorage.getItem("globaltrace.tracePackets")).toBeNull();
  });

  it("persists liquid glass preference locally", async () => {
    mockApi();
    setNavigatorDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });

    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    openAdvancedParams();

    const liquidGlassSwitch = screen.getByRole("switch", { name: "液态玻璃效果" });
    const liquidGlassIntensity = screen.getByLabelText("液态玻璃强度") as HTMLInputElement;
    expect(liquidGlassSwitch).not.toBeChecked();
    expect(liquidGlassIntensity).toHaveValue("70");
    expect(liquidGlassIntensity).toBeDisabled();
    expect(document.documentElement).toHaveClass("liquid-glass-force-fallback");

    fireEvent.click(liquidGlassSwitch);
    await waitFor(() => {
      expect(window.localStorage.getItem("globaltrace.liquidGlass")).toBe("enabled");
    });
    expect(screen.getByRole("switch", { name: "液态玻璃效果" })).toBeChecked();
    expect(screen.getByLabelText("液态玻璃强度")).not.toBeDisabled();

    fireEvent.change(liquidGlassIntensity, { target: { value: "85" } });
    await waitFor(() => {
      expect(window.localStorage.getItem("globaltrace.liquidGlassIntensity")).toBe("85");
    });

    fireEvent.click(liquidGlassSwitch);
    await waitFor(() => {
      expect(window.localStorage.getItem("globaltrace.liquidGlass")).toBe("disabled");
    });
    expect(screen.getByRole("switch", { name: "液态玻璃效果" })).not.toBeChecked();
    expect(screen.getByLabelText("液态玻璃强度")).toBeDisabled();
    expect(screen.getByLabelText("液态玻璃强度")).toHaveValue("85");
    expect(document.documentElement).toHaveClass("liquid-glass-force-fallback");

    fireEvent.click(screen.getByRole("switch", { name: "液态玻璃效果" }));
    await waitFor(() => {
      expect(window.localStorage.getItem("globaltrace.liquidGlass")).toBe("enabled");
    });
    expect(screen.getByRole("switch", { name: "液态玻璃效果" })).toBeChecked();
  });

  it("defaults liquid glass off on non-Apple devices", async () => {
    mockApi();
    setNavigatorDevice({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32" });

    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    openAdvancedParams();

    expect(screen.getByRole("switch", { name: "液态玻璃效果" })).not.toBeChecked();
    expect(document.documentElement).toHaveClass("liquid-glass-force-fallback");
  });

  it("saves a Globalping token for the current session and sends it only to Globalping", async () => {
    const fetchMock = mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    openAdvancedParams();
    fireEvent.change(screen.getByLabelText("Globalping Token"), { target: { value: "  gp-token  " } });
    fireEvent.click(screen.getByRole("button", { name: "保存 Globalping" }));

    await waitFor(() => {
      expect(window.sessionStorage.getItem("globaltrace.globalpingToken")).toBe("gp-token");
      expect(window.localStorage.getItem("globaltrace.globalpingToken")).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.globalping.io/v1/limits",
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer gp-token" }),
        }),
      );
    });
    expect(screen.getByText("Globalping Token 仅当前会话可用")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    await waitFor(() => {
      expect(traceCreateBodies(fetchMock)).toHaveLength(1);
      expect(traceEnrichBodies(fetchMock)).toHaveLength(1);
    });
    const traceCall = fetchMock.mock.calls.find(
      ([path, init]) => path === "https://api.globalping.io/v1/measurements" && init?.method === "POST",
    );
    const enrichCall = fetchMock.mock.calls.find(([path, init]) => path === "/api/trace/enrich" && init?.method === "POST");
    expect(traceCall?.[1]?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer gp-token" }));
    expect(enrichCall?.[1]?.headers).not.toEqual(expect.objectContaining({ Authorization: expect.any(String) }));
  });

  it("remembers tokens locally only when the user opts in", async () => {
    mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    openAdvancedParams();
    fireEvent.click(screen.getByLabelText("记住 Globalping 到本机"));
    fireEvent.change(screen.getByLabelText("Globalping Token"), { target: { value: "gp-token" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 Globalping" }));
    fireEvent.click(screen.getByLabelText("记住 NextTrace 到本机"));
    fireEvent.change(screen.getByLabelText("NextTrace API Token"), { target: { value: "nt-token" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 NextTrace" }));

    await waitFor(() => {
      expect(window.localStorage.getItem("globaltrace.globalpingToken")).toBe("gp-token");
      expect(window.localStorage.getItem("globaltrace.nexttraceApiToken")).toBe("nt-token");
    });
    expect(window.sessionStorage.getItem("globaltrace.globalpingToken")).toBeNull();
    expect(window.sessionStorage.getItem("globaltrace.nexttraceApiToken")).toBeNull();
    expect(screen.getByText("Globalping Token 已记住到本机浏览器")).toBeInTheDocument();
    expect(screen.getByText("NextTrace Token 已记住到本机浏览器")).toBeInTheDocument();
  });

  it("reads legacy localStorage tokens as remembered", async () => {
    window.localStorage.setItem("globaltrace.globalpingToken", "legacy-gp");
    window.localStorage.setItem("globaltrace.nexttraceApiToken", "legacy-nt");
    mockApi();

    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    openAdvancedParams();

    expect(screen.getByLabelText("Globalping Token")).toHaveValue("legacy-gp");
    expect(screen.getByLabelText("NextTrace API Token")).toHaveValue("legacy-nt");
    expect(screen.getByLabelText("记住 Globalping 到本机")).toHaveAttribute("data-state", "checked");
    expect(screen.getByLabelText("记住 NextTrace 到本机")).toHaveAttribute("data-state", "checked");
    expect(screen.getByText("Globalping Token 已记住到本机浏览器")).toBeInTheDocument();
    expect(screen.getByText("NextTrace Token 已记住到本机浏览器")).toBeInTheDocument();
  });

  it("saves a NextTrace token for the current session and uses it without server enrichment", async () => {
    const fetchMock = mockApi({ measurement: globalpingMeasurementWithHop });
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    openAdvancedParams();
    fireEvent.change(screen.getByLabelText("NextTrace API Token"), { target: { value: "  nt-token  " } });
    fireEvent.click(screen.getByRole("button", { name: "保存 NextTrace" }));

    await waitFor(() => {
      expect(window.sessionStorage.getItem("globaltrace.nexttraceApiToken")).toBe("nt-token");
      expect(window.localStorage.getItem("globaltrace.nexttraceApiToken")).toBeNull();
    });
    expect(screen.getByText("NextTrace Token 仅当前会话可用")).toBeInTheDocument();
    expect(await screen.findByText("NextTrace API Token 直连已启用")).toBeInTheDocument();
    expect(screen.getByText("可创建诊断 249/250（当前 IP）")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    expect(traceCreateBodies(fetchMock)).toHaveLength(1);
    expect(traceEnrichBodies(fetchMock)).toHaveLength(0);
    expect(nexttraceBatchBodies(fetchMock)).toEqual([{ ips: [FALLBACK_HOP_IP] }]);
    expect(nexttraceBatchCalls(fetchMock)[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-NextTrace-Token": "nt-token",
      }),
    );
    expect(JSON.stringify(nexttraceBatchCalls(fetchMock)[0]?.[1]?.headers)).not.toContain("User-Agent");
  });

  it("reruns the current finished result through a newly saved NextTrace token", async () => {
    const fetchMock = mockApi({ enrichmentStatus: "partial", measurement: globalpingMeasurementWithHop });
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    expect(traceEnrichBodies(fetchMock)).toHaveLength(1);
    expect(nexttraceBatchBodies(fetchMock)).toHaveLength(0);

    openAdvancedParams();
    fireEvent.change(screen.getByLabelText("NextTrace API Token"), { target: { value: " nt-token " } });
    fireEvent.click(screen.getByRole("button", { name: "保存 NextTrace" }));

    await waitFor(() => {
      expect(nexttraceBatchBodies(fetchMock)).toEqual([{ ips: [FALLBACK_HOP_IP] }]);
    });
    expect(fetchMock.mock.calls.filter(([path]) => path === "https://api.globalping.io/v1/measurements/m123")).toHaveLength(1);
    expect(traceEnrichBodies(fetchMock)).toHaveLength(1);
  });

  it("opens shared results without auto-using saved browser tokens", async () => {
    window.localStorage.setItem("globaltrace.globalpingToken", "gp-token");
    window.localStorage.setItem("globaltrace.nexttraceApiToken", "nt-token");
    window.history.replaceState(null, "", "/?measurement=m123");
    const fetchMock = mockApi({
      traceStatus: () => "finished",
      measurement: globalpingMeasurementWithHop,
    });

    render(<App />);

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    expect(traceEnrichBodies(fetchMock)).toEqual([{ measurementId: "m123" }]);
    expect(nexttraceBatchBodies(fetchMock)).toHaveLength(0);
    expect(fetchMock.mock.calls.find(([path]) => path === "https://api.globalping.io/v1/measurements/m123")?.[1]?.headers).not.toEqual(
      expect.objectContaining({ Authorization: expect.any(String) }),
    );
  });

  it("uses cached worker traces when opening shared results with a saved NextTrace token", async () => {
    window.localStorage.setItem("globaltrace.nexttraceApiToken", "nt-token");
    window.history.replaceState(null, "", "/?measurement=m123");
    const fetchMock = mockApi({
      cachedTrace: {
        ...traceResult("finished", "partial"),
        enrichment: {
          status: "partial",
          cached: 0,
          fetched: 0,
          errors: [{ ips: [FALLBACK_HOP_IP], message: "stale nxtrace batch failed" }],
        },
      },
      traceStatus: () => "finished",
      measurement: globalpingMeasurementWithHop,
    });

    render(<App />);

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([path]) => path === "https://api.globalping.io/v1/measurements/m123")).toBe(false);
    expect(traceEnrichBodies(fetchMock)).toHaveLength(0);
    expect(nexttraceBatchBodies(fetchMock)).toHaveLength(0);
  });

  it("renders the about route with attribution links", async () => {
    window.history.replaceState(null, "", "/about");
    mockApi({ backgroundImage: bingBackgroundImage() });

    render(<App />);

    const aboutDialog = await screen.findByRole("dialog", { name: "关于 GlobalTrace" });
    expect(aboutDialog).toHaveClass("glass-overlay-bare-surface");
    expect(document.querySelector(".glass-overlay-about .glass-overlay-header")).toBeNull();
    expect(document.querySelector(".glass-overlay-about .glass-overlay-body")).toBeNull();
    expect(document.querySelector(".glass-overlay-about .glass-overlay-panel")).toBeNull();
    expect(await within(aboutDialog).findByRole("heading", { name: "GlobalTrace" })).toBeInTheDocument();
    expect(aboutDialog.querySelector(".about-panel-surface[data-liquid-glass]")).not.toBeNull();
    expect(aboutDialog.querySelector(".about-panel")).not.toBeNull();
    expect(
      within(aboutDialog).getByText(
        "GlobalTrace 是一个 Globalping x NextTrace 的开源项目，借助 Globalping 遍布全球的 Probe 发起路由追踪，并结合 NextTrace 骨干网 IP 数据库增强地理位置与网络归属信息。",
      ),
    ).toBeInTheDocument();
    expect(within(aboutDialog).getByRole("link", { name: /Globalping API docs/ })).toHaveAttribute(
      "href",
      "https://globalping.io/docs/api.globalping.io",
    );
    expect(within(aboutDialog).getByRole("link", { name: /NTrace-core GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/nxtrace/NTrace-core",
    );
    expect(within(aboutDialog).getByRole("link", { name: /GlobalTrace GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/nxtrace/GlobalTrace",
    );
    expect(within(aboutDialog).getByRole("heading", { name: "开源协议" })).toBeInTheDocument();
    expect(within(aboutDialog).getByText("GlobalTrace 以 GPL-3.0-or-later 开源发布。")).toBeInTheDocument();
    expect(within(aboutDialog).getByRole("link", { name: /GPL-3.0-or-later/ })).toHaveAttribute(
      "href",
      "https://github.com/nxtrace/GlobalTrace/blob/master/LICENSE",
    );
    expect(within(aboutDialog).getByRole("link", { name: "源码" })).toHaveAttribute("href", "https://github.com/nxtrace/GlobalTrace");
    expect(within(aboutDialog).getByText(/背景：岁月的层峦/).closest("a")).toHaveAttribute(
      "href",
      "https://www.bing.com/search?q=%E6%81%B6%E5%9C%B0",
    );
    expect(document.documentElement).toHaveClass("ambient-photo-ready");
    expect(document.querySelector(".app-shell")).toHaveClass("ambient-photo-ready");
  });

  it("updates filters when a map probe is selected", async () => {
    mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(await screen.findByRole("button", { name: "pick first probe" }));

    await waitFor(() => {
      expect(screen.getAllByText("已添加 Los Angeles · AS7922").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("1 / 2 probes 匹配")).toBeInTheDocument();
    expect(screen.getByText("map-probe-count:2")).toBeInTheDocument();
    const chips = screen.getByTestId("filter-chips");
    expect(chips).toHaveTextContent("Los Angeles+US+AS7922");
    expect(within(chips).queryByText("magic")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "pick second probe" }));
    await waitFor(() => {
      expect(screen.getAllByText("已添加 Falkenstein · AS24940").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("2 / 2 probes 匹配")).toBeInTheDocument();
    expect(screen.getByText("map-probe-count:2")).toBeInTheDocument();
    expect(chips).toHaveTextContent("Los Angeles+US+AS7922");
    expect(chips).toHaveTextContent("Falkenstein+DE+AS24940");
  });

  it("converts structured filters to magic before appending a map probe", async () => {
    mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    openExactFilters();
    fireEvent.change(screen.getByLabelText("国家/地区"), { target: { value: "US" } });
    await waitFor(() => {
      expect(screen.getByText("1 / 2 probes 匹配")).toBeInTheDocument();
    });

    fireEvent.click(await screen.findByRole("button", { name: "pick second probe" }));

    await waitFor(() => {
      expect(screen.getAllByText("已添加 Falkenstein · AS24940").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("2 / 2 probes 匹配")).toBeInTheDocument();
    const chips = screen.getByTestId("filter-chips");
    expect(chips).toHaveTextContent("US, Falkenstein+DE+AS24940");
    expect(within(chips).queryByText("国家/地区")).not.toBeInTheDocument();
  });

  it("narrows field suggestions with other structured filters", async () => {
    mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    openExactFilters();
    const countryInput = screen.getByLabelText("国家/地区");
    fireEvent.change(countryInput, { target: { value: "US" } });

    await waitFor(() => {
      expect(screen.getByText("1 / 2 probes 匹配")).toBeInTheDocument();
    });

    fireEvent.blur(countryInput);
    fireEvent.focus(screen.getByLabelText("network"));
    const networkListbox = screen.getByRole("listbox", { name: "候选列表" });
    expect(within(networkListbox).getByRole("option", { name: "Comcast" })).toBeInTheDocument();
    expect(within(networkListbox).queryByRole("option", { name: "Hetzner Online" })).not.toBeInTheDocument();
  });

  it("connects online probe suggestions to the magic string input", async () => {
    const fetchMock = mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    const magicInput = screen.getByLabelText("magic string");
    expect(magicInput).toHaveValue("");

    fireEvent.focus(magicInput);
    expect(screen.queryByRole("listbox", { name: "候选列表" })).not.toBeInTheDocument();

    fireEvent.change(magicInput, { target: { value: "US+Com" } });
    const magicListbox = screen.getByRole("listbox", { name: "候选列表" });
    expect(within(magicListbox).getByRole("option", { name: "US+Comcast" })).toBeInTheDocument();
    expect(within(magicListbox).getByRole("option", { name: "US+AS7922+Comcast" })).toBeInTheDocument();
    fireEvent.mouseDown(within(magicListbox).getByRole("option", { name: "US+Comcast" }));

    await waitFor(() => {
      expect(screen.getByText("1 / 2 probes 匹配")).toBeInTheDocument();
    });
    expect(magicInput).toHaveValue("US+Comcast");

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    expect(traceCreateBodies(fetchMock)[0].locations).toEqual([
      { magic: "Los Angeles+US+AS7922+eyeball-network" },
    ]);
  });

  it("filters magic suggestions regardless of token order", async () => {
    mockApi({ probes: makeChinaProbes(4) });
    render(<App />);

    await screen.findByText("4 / 4 probes 匹配");
    const magicInput = screen.getByLabelText("magic string");
    fireEvent.change(magicInput, { target: { value: "AS4134+CN" } });

    await waitFor(() => {
      expect(screen.getByText("4 / 4 probes 匹配")).toBeInTheDocument();
    });
    const magicListbox = screen.getByRole("listbox", { name: "候选列表" });
    expect(within(magicListbox).getByRole("option", { name: "CN+AS4134" })).toBeInTheDocument();
    expect(within(magicListbox).getByRole("option", { name: "Shenzhen+CN+AS4134+eyeball-network" })).toBeInTheDocument();
    expect(within(magicListbox).getByRole("option", { name: "Nanning+CN+AS4134+eyeball-network" })).toBeInTheDocument();

    fireEvent.change(magicInput, { target: { value: "China Telecom+Sh" } });

    await waitFor(() => {
      expect(screen.getByText("2 / 4 probes 匹配")).toBeInTheDocument();
    });
    const networkMagicListbox = screen.getByRole("listbox", { name: "候选列表" });
    expect(within(networkMagicListbox).getByRole("option", { name: "Shenzhen+CN+AS4134+China Telecom" })).toBeInTheDocument();
  });

  it("shows generic magic suggestions for partial city tokens", async () => {
    mockApi({ probes: makeShanghaiProbes() });
    render(<App />);

    await screen.findByText("4 / 4 probes 匹配");
    const magicInput = screen.getByLabelText("magic string");
    fireEvent.change(magicInput, { target: { value: "CN+Sha" } });

    await waitFor(() => {
      expect(screen.getByText("1 / 4 probes 匹配")).toBeInTheDocument();
    });
    const magicListbox = screen.getByRole("listbox", { name: "候选列表" });
    expect(within(magicListbox).getByRole("option", { name: "CN+Shanghai" })).toBeInTheDocument();
    expect(within(magicListbox).getByRole("option", { name: "Shanghai+CN+AS4134+eyeball-network" })).toBeInTheDocument();
  });

  it("auto-expands probe limit when selecting a generic magic suggestion", async () => {
    mockApi({ probes: makeChinaProbes(4) });
    render(<App />);

    await screen.findByText("4 / 4 probes 匹配");
    const magicInput = screen.getByLabelText("magic string");
    fireEvent.change(magicInput, { target: { value: "AS4134+CN" } });

    const magicListbox = screen.getByRole("listbox", { name: "候选列表" });
    fireEvent.mouseDown(within(magicListbox).getByRole("option", { name: "CN+AS4134" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Limit")).toHaveTextContent("4");
    });
    expect(magicInput).toHaveValue("CN+AS4134");
  });

  it("connects online tag suggestions to the advanced tag input", async () => {
    mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    openExactFilters();
    const tagInput = screen.getByLabelText("tag");
    fireEvent.change(tagInput, { target: { value: "eye" } });

    await waitFor(() => {
      expect(screen.getByText("1 / 2 probes 匹配")).toBeInTheDocument();
    });
    const tagListbox = screen.getByRole("listbox", { name: "候选列表" });
    expect(within(tagListbox).getByRole("option", { name: "eyeball-network" })).toBeInTheDocument();

    fireEvent.mouseDown(within(tagListbox).getByRole("option", { name: "eyeball-network" }));

    await waitFor(() => {
      expect(tagInput).toHaveValue("eyeball-network");
    });
  });

  it("auto-expands probe limit for explicit filters without shrinking it", async () => {
    mockApi({ probes: [...makeChinaProbes(4), probes[0]] });
    render(<App />);

    await screen.findByText("5 / 5 probes 匹配");
    expect(screen.getByLabelText("Limit")).toHaveTextContent("3");

    openExactFilters();
    fireEvent.change(screen.getByLabelText("国家/地区"), { target: { value: "CN" } });

    await waitFor(() => {
      expect(screen.getByLabelText("Limit")).toHaveTextContent("4");
    });

    fireEvent.change(screen.getByLabelText("城市"), { target: { value: "Shenzhen" } });

    await waitFor(() => {
      expect(screen.getByText("1 / 5 probes 匹配")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Limit")).toHaveTextContent("4");
  });

  it("caps explicit filter probe expansion at ten", async () => {
    mockApi({ probes: makeChinaProbes(12) });
    render(<App />);

    await screen.findByText("12 / 12 probes 匹配");
    openExactFilters();
    fireEvent.change(screen.getByLabelText("国家/地区"), { target: { value: "CN" } });

    await waitFor(() => {
      expect(screen.getByLabelText("Limit")).toHaveTextContent("10");
    });
  });

  it("normalizes reversed magic filters before creating a trace", async () => {
    const fetchMock = mockApi({ probes: makeChinaProbes(4) });
    render(<App />);

    await screen.findByText("4 / 4 probes 匹配");
    fireEvent.change(screen.getByLabelText("magic string"), { target: { value: "AS4134+CN" } });

    await waitFor(() => {
      expect(screen.getByLabelText("Limit")).toHaveTextContent("4");
    });
    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    const body = traceCreateBodies(fetchMock)[0];
    expect(body.limit).toBe(4);
    expect(body.locations).toEqual([
      { magic: "Shenzhen+CN+AS4134+eyeball-network" },
      { magic: "Nanning+CN+AS4134+eyeball-network" },
      { magic: "Guangzhou+CN+AS4134+eyeball-network" },
      { magic: "Shenzhou+CN+AS4134+datacenter-network" },
    ]);
  });

  it("caps box selection at ten probes and updates the probe limit", async () => {
    const fetchMock = mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(await screen.findByRole("button", { name: "box many probes" }));

    await waitFor(() => {
      expect(screen.getAllByText("已添加框选 12 个 probes，保留最近 10 个").length).toBeGreaterThan(0);
    });
    expect(screen.getByLabelText("Limit")).toHaveTextContent("10");

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    await screen.findByText("result:finished:m123");
    const body = traceCreateBodies(fetchMock)[0];
    expect(body.locations).toHaveLength(10);
    expect(JSON.stringify(body.locations)).not.toContain("Comcast");
  });

  it("creates a trace and polls until the measurement finishes", async () => {
    const fetchMock = mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    expect(screen.getByLabelText("mock probe map")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "诊断结果" })).toBeInTheDocument();
    expect(window.location.search).toBe("?measurement=m123");
    expect(fetchMock).toHaveBeenCalledWith("https://api.globalping.io/v1/measurements", expect.objectContaining({ method: "POST" }));
    expect(traceCreateBodies(fetchMock)[0].measurementOptions.ipVersion).toBe(4);
    expect(traceCreateBodies(fetchMock)[0].measurementOptions).toMatchObject({ packets: 5 });
  });

  it("keeps the share URL contract when switching the result map to 3D", async () => {
    const fetchMock = mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "切换结果地图到 3D" }));
    expect(screen.getByText("projection:globe")).toBeInTheDocument();
    expect(window.location.search).toBe("?measurement=m123");
    expect(window.location.href).not.toContain("view=");
    expect(traceCreateBodies(fetchMock)).toHaveLength(1);
  });

  it("starts directly when legacy config includes a Turnstile site key", async () => {
    const fetchMock = mockApi({ traceStatus: () => "finished", legacyTurnstileSiteKey: "site-key" });
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    expect(screen.queryByText(/Turnstile/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    await waitFor(() => expect(traceEnrichBodies(fetchMock)).toEqual([{ measurementId: "m123" }]));
  });

  it("waits after Globalping reports finished before worker enrichment", async () => {
    const fetchMock = mockApi({ traceStatus: (polls) => (polls === 1 ? "in-progress" : "finished") });
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([path]) => path === "https://api.globalping.io/v1/measurements/m123")).toHaveLength(1);
    });
    expect(traceEnrichBodies(fetchMock)).toHaveLength(0);

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([path]) => path === "https://api.globalping.io/v1/measurements/m123")).toHaveLength(2);
    }, { timeout: POLL_DELAY_MS + 500 });
    expect(traceEnrichBodies(fetchMock)).toHaveLength(0);

    await waitMs(ENRICH_AFTER_FINISHED_DELAY_MS - 100);
    expect(traceEnrichBodies(fetchMock)).toHaveLength(0);

    await waitFor(() => expect(traceEnrichBodies(fetchMock)).toEqual([{ measurementId: "m123" }]), { timeout: 500 });
  });

  it("opens shared results directly when legacy config includes a Turnstile site key", async () => {
    const fetchMock = mockApi({ traceStatus: () => "finished", legacyTurnstileSiteKey: "site-key" });
    window.history.replaceState(null, "", "/?measurement=m123");

    render(<App />);

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    expect(screen.queryByText(/Turnstile/)).not.toBeInTheDocument();
    expect(traceEnrichBodies(fetchMock)).toEqual([{ measurementId: "m123" }]);
  });

  it("rejects shared non-MTR measurements without rendering a temporary result", async () => {
    const fetchMock = mockApi({
      traceStatus: () => "finished",
      measurement: (status) => ({ ...globalpingMeasurement(status), type: "ping" }),
    });
    window.history.replaceState(null, "", "/?measurement=m123");

    render(<App />);

    expect(await screen.findByText("measurement.type must be mtr")).toBeInTheDocument();
    expect(screen.queryByLabelText("mock results")).not.toBeInTheDocument();
    expect(traceEnrichBodies(fetchMock)).toHaveLength(0);
  });

  it("returns to the home view from the brand link", async () => {
    mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "返回首页" }));

    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
    expect(await screen.findByLabelText("mock probe map")).toBeInTheDocument();
    expect(screen.queryByLabelText("mock results")).not.toBeInTheDocument();
  });

  it("shows a result loading state immediately when opening a shared measurement", async () => {
    const measurementResponse = deferredResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/config") return json({ mapStyleUrl: "about:blank" });
        if (path === "/api/probes") return json({ probes, fetchedAt: "2026-06-09T00:00:00.000Z" });
        if (path === "https://api.globalping.io/v1/limits") {
          return json({
            rateLimit: { measurements: { create: { type: "ip", limit: 250, remaining: 249, reset: 60 } } },
          });
        }
        if (path === "/api/trace/m123") return new Response(null, { status: 204 });
        if (path === "https://api.globalping.io/v1/measurements/m123") return measurementResponse.promise;
        if (path === "/api/trace/enrich" && init?.method === "POST") return json(traceResult("finished"));
        throw new Error(`unexpected fetch: ${path}`);
      }),
    );
    window.history.replaceState(null, "", "/?measurement=m123");

    render(<App />);

    expect(await screen.findByRole("dialog", { name: "读取诊断结果" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "正在读取 measurement" })).toBeInTheDocument();
    expect(screen.getByText("正在读取 Globalping measurement，完成后会自动展示结果。")).toBeInTheDocument();
    expect(screen.getByText("m123")).toBeInTheDocument();
    expect(screen.getByText("网络路径诊断")).toBeInTheDocument();
    expect(document.querySelector(".shared-result-loading")).toBeNull();

    measurementResponse.resolve(json(globalpingMeasurement("finished")));

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
  });

  it("uses the same loading dialog for created measurements", async () => {
    mockApi({ traceStatus: () => "in-progress" });
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(await screen.findByRole("dialog", { name: "读取诊断结果" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "正在读取 measurement" })).toBeInTheDocument();
    expect(screen.queryByText("正在读取 measurement，完成后会自动展示结果。")).not.toBeInTheDocument();
    expect(document.querySelector(".loading-strip")).toBeNull();
  });

  it("cancels created measurement loading without showing late results", async () => {
    const measurementResponse = deferredResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/background") return new Response(null, { status: 204 });
        if (path === "/api/config") return json({ mapStyleUrl: "about:blank" });
        if (path === "/api/probes") return json({ probes, fetchedAt: "2026-06-09T00:00:00.000Z" });
        if (path === "https://api.globalping.io/v1/limits") {
          return json({
            rateLimit: { measurements: { create: { type: "ip", limit: 250, remaining: 249, reset: 60 } } },
          });
        }
        if (path === "https://api.globalping.io/v1/measurements" && init?.method === "POST") {
          return json({ id: "m123", probesCount: 1 }, 202);
        }
        if (path === "/api/trace/m123") return new Response(null, { status: 204 });
        if (path === "https://api.globalping.io/v1/measurements/m123") return measurementResponse.promise;
        if (path === "/api/trace/enrich" && init?.method === "POST") return json(traceResult("finished"));
        throw new Error(`unexpected fetch: ${path}`);
      }),
    );

    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    expect(await screen.findByRole("dialog", { name: "读取诊断结果" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭读取诊断结果" }));
    expect(screen.queryByRole("dialog", { name: "读取诊断结果" })).not.toBeInTheDocument();
    expect(await screen.findByLabelText("mock probe map")).toBeInTheDocument();

    measurementResponse.resolve(json(globalpingMeasurement("finished")));

    await waitFor(() => {
      expect(screen.queryByLabelText("mock results")).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "诊断结果" })).not.toBeInTheDocument();
    });
  });

  it("cancels shared measurement loading without showing late results", async () => {
    const measurementResponse = deferredResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/background") return new Response(null, { status: 204 });
        if (path === "/api/config") return json({ mapStyleUrl: "about:blank" });
        if (path === "/api/probes") return json({ probes, fetchedAt: "2026-06-09T00:00:00.000Z" });
        if (path === "https://api.globalping.io/v1/limits") {
          return json({
            rateLimit: { measurements: { create: { type: "ip", limit: 250, remaining: 249, reset: 60 } } },
          });
        }
        if (path === "/api/trace/m123") return new Response(null, { status: 204 });
        if (path === "https://api.globalping.io/v1/measurements/m123") return measurementResponse.promise;
        if (path === "/api/trace/enrich" && init?.method === "POST") return json(traceResult("finished"));
        throw new Error(`unexpected fetch: ${path}`);
      }),
    );
    window.history.replaceState(null, "", "/?measurement=m123");

    render(<App />);

    expect(await screen.findByRole("dialog", { name: "读取诊断结果" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭读取诊断结果" }));
    expect(screen.queryByRole("dialog", { name: "读取诊断结果" })).not.toBeInTheDocument();
    expect(await screen.findByLabelText("mock probe map")).toBeInTheDocument();

    measurementResponse.resolve(json(globalpingMeasurement("finished")));

    await waitFor(() => {
      expect(screen.queryByLabelText("mock results")).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "诊断结果" })).not.toBeInTheDocument();
    });
  });

  it("submits selected IP version and reset restores IPv4", async () => {
    const fetchMock = mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    expect(screen.getByRole("button", { name: "IPv4" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "IPv4" }));
    expect(screen.getByRole("button", { name: "IPv6" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    expect(traceCreateBodies(fetchMock)[0].measurementOptions.ipVersion).toBe(6);

    fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));
    expect(screen.getByRole("button", { name: "IPv4" })).toBeInTheDocument();
    expect(screen.getByLabelText("Limit")).toHaveTextContent("3");
    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    await waitFor(() => {
      expect(traceCreateBodies(fetchMock)).toHaveLength(2);
    });
    expect(traceCreateBodies(fetchMock)[1].measurementOptions.ipVersion).toBe(4);
  });

  it("keeps probe selection visible while polling, then lets users close and reopen results", async () => {
    const fetchMock = mockApi({ traceStatus: (polls) => (polls === 1 ? "in-progress" : "finished") });
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("https://api.globalping.io/v1/measurements/m123", expect.anything());
    });
    expect(await screen.findByLabelText("mock probe map")).toBeInTheDocument();
    expect(screen.queryByLabelText("mock results")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看结果" })).not.toBeInTheDocument();

    expect(await screen.findByText("result:finished:m123", {}, { timeout: POLL_DELAY_MS + ENRICH_AFTER_FINISHED_DELAY_MS + 1000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭结果" }));
    expect(await screen.findByLabelText("mock probe map")).toBeInTheDocument();
    expect(screen.queryByLabelText("mock results")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看结果" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看结果" }));
    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
  });

  it("stops polling stuck measurements and keeps the share URL usable", async () => {
    mockApi({ traceStatus: () => "in-progress" });
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    await screen.findByLabelText("mock probe map");
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    for (let attempt = 0; attempt < TRACE_MAX_POLL_ATTEMPTS; attempt += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_DELAY_MS);
      });
    }

    expect(screen.getByText("measurement 仍在运行，请稍后通过分享 URL 重新打开。")).toBeInTheDocument();
    expect(window.location.search).toBe("?measurement=m123");
    expect(screen.getByLabelText("mock probe map")).toBeInTheDocument();
    expect(screen.queryByLabelText("mock results")).not.toBeInTheDocument();
  });

  it("surfaces probes and quota loading failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/config") {
          return json({ mapStyleUrl: "about:blank" });
        }
        if (path === "/api/probes") {
          return json({ error: { message: "probes down" } }, 502);
        }
        if (path === "https://api.globalping.io/v1/limits") {
          return json({ message: "limits down" }, 502);
        }
        throw new Error(`unexpected fetch: ${path}`);
      }),
    );

    render(<App />);

    expect(await screen.findByText("probes down")).toBeInTheDocument();
    expect(await screen.findByText("Globalping credits 控制诊断创建")).toBeInTheDocument();
    expect(await screen.findByText("诊断额度暂不可用")).toBeInTheDocument();
  });

  it("turns upstream parameter validation failures into actionable copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/config") return json({ mapStyleUrl: "about:blank" });
        if (path === "/api/probes") return json({ probes, fetchedAt: "2026-06-09T00:00:00.000Z" });
        if (path === "https://api.globalping.io/v1/limits") {
          return json({
            rateLimit: { measurements: { create: { type: "ip", limit: 250, remaining: 249, reset: 60 } } },
          });
        }
        if (path === "https://api.globalping.io/v1/measurements" && init?.method === "POST") {
          return json({ message: "Parameter validation failed." }, 400);
        }
        throw new Error(`unexpected fetch: ${path}`);
      }),
    );

    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(await screen.findByText(/Globalping 筛选条件无效：Parameter validation failed\./)).toBeInTheDocument();
    expect(screen.getByText(/请重置筛选/)).toBeInTheDocument();
  });
});

function mockApi(
  options: {
    backgroundImage?: unknown;
    backgroundStatus?: number;
    traceStatus?: (polls: number) => TraceResultResponse["status"];
    legacyTurnstileSiteKey?: string;
    enrichmentStatus?: TraceResultResponse["enrichment"]["status"];
    measurement?: (status: TraceResultResponse["status"]) => GlobalpingMeasurement;
    cachedTrace?: TraceResultResponse;
    probes?: GlobalpingProbe[];
  } = {},
) {
  let tracePolls = 0;
  const mockProbes = options.probes || probes;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/background") {
      if (options.backgroundStatus) return json({ error: { message: "background unavailable" } }, options.backgroundStatus);
      if (options.backgroundImage) return json(options.backgroundImage);
      return new Response(null, { status: 204 });
    }
    if (path === "/api/config") {
      return json({ turnstileSiteKey: options.legacyTurnstileSiteKey || undefined, mapStyleUrl: "about:blank" });
    }
    if (path === "/api/probes") {
      return json({ probes: mockProbes, fetchedAt: "2026-06-09T00:00:00.000Z" });
    }
    if (path === "https://api.globalping.io/v1/limits") {
      return json({
        rateLimit: { measurements: { create: { type: "ip", limit: 250, remaining: 249, reset: 60 } } },
      });
    }
    if (path === "https://api.globalping.io/v1/measurements" && init?.method === "POST") {
      return json({ id: "m123", probesCount: 1 }, 202);
    }
    if (path === "/api/trace/m123") {
      if (options.cachedTrace) return json(options.cachedTrace);
      return new Response(null, { status: 204 });
    }
    if (path === "https://api.globalping.io/v1/measurements/m123") {
      tracePolls += 1;
      const status = options.traceStatus?.(tracePolls) ?? "finished";
      return json((options.measurement || globalpingMeasurement)(status));
    }
    if (path === "/api/trace/enrich" && init?.method === "POST") {
      return json(traceResultFromMeasurement(options.measurement?.("finished"), options.enrichmentStatus));
    }
    if (path === `https://ipinfo.io/${FALLBACK_HOP_IP}`) {
      return json({
        ip: FALLBACK_HOP_IP,
        city: "Englewood",
        region: "Colorado",
        country: "US",
        loc: "39.6123,-104.8799",
      });
    }
    if (path.startsWith("https://stat.ripe.net/data/prefix-overview/data.json")) {
      expect(new URL(path).searchParams.get("resource")).toBe(FALLBACK_HOP_IP);
      return json({
        status: "ok",
        data: {
          resource: "206.83.141.0/24",
          asns: [{ asn: 64500, holder: "EXAMPLE - Example Network" }],
        },
      });
    }
    if (path === "https://api.nxtrace.org/v4/ipGeo/batch" && init?.method === "POST") {
      const ips = JSON.parse(String(init.body)).ips as string[];
      return json({
        results: ips.map((ip) => ({
          ip,
          ok: true,
          data: { ip, asnumber: "AS64500", source: "mock-nexttrace" },
        })),
      });
    }
    throw new Error(`unexpected fetch: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function traceCreateBodies(fetchMock: ReturnType<typeof mockApi>): Array<{
  locations: Array<{ magic: string }>;
  limit: number;
  measurementOptions: { ipVersion?: 4 | 6; packets?: number; port?: number };
}> {
  return fetchMock.mock.calls
    .filter(([path, init]) => path === "https://api.globalping.io/v1/measurements" && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)));
}

function traceEnrichBodies(fetchMock: ReturnType<typeof mockApi>): Array<{ measurementId?: string }> {
  return fetchMock.mock.calls
    .filter(([path, init]) => path === "/api/trace/enrich" && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)));
}

function nexttraceBatchCalls(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls.filter(([path, init]) => path === "https://api.nxtrace.org/v4/ipGeo/batch" && init?.method === "POST");
}

function nexttraceBatchBodies(fetchMock: ReturnType<typeof mockApi>): Array<{ ips: string[] }> {
  return nexttraceBatchCalls(fetchMock).map(([, init]) => JSON.parse(String(init?.body)));
}

function bingBackgroundImage() {
  return {
    imageUrl: "/api/background/image",
    title: "岁月的层峦",
    copyright: "落日，恶地国家公园，南达科他州，美国 (© Troy Harrison/Getty Images)",
    copyrightLink: "https://www.bing.com/search?q=%E6%81%B6%E5%9C%B0",
    source: "bing",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, String(value)),
  };
}

function setNavigatorDevice({
  userAgent,
  platform,
  maxTouchPoints = 0,
  userAgentDataPlatform,
}: {
  userAgent: string;
  platform: string;
  maxTouchPoints?: number;
  userAgentDataPlatform?: string;
}): void {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, get: () => userAgent });
  Object.defineProperty(window.navigator, "platform", { configurable: true, get: () => platform });
  Object.defineProperty(window.navigator, "maxTouchPoints", { configurable: true, get: () => maxTouchPoints });
  Object.defineProperty(window.navigator, "userAgentData", {
    configurable: true,
    get: () => (userAgentDataPlatform ? { platform: userAgentDataPlatform } : undefined),
  });
}

function repeatProbes(probe: GlobalpingProbe, count: number): GlobalpingProbe[] {
  return Array.from({ length: count }, (_, index) => ({
    ...probe,
    location: {
      ...probe.location,
      city: `Los Angeles ${index}`,
      asn: 7900 + index,
    },
  }));
}

function makeChinaProbes(count: number): GlobalpingProbe[] {
  const cities = ["Shenzhen", "Nanning", "Guangzhou", "Shenzhou"];
  return Array.from({ length: count }, (_, index) => ({
    location: {
      continent: "AS",
      region: "Eastern Asia",
      country: "CN",
      state: null,
      city: cities[index] || `China ${index}`,
      asn: 4134,
      latitude: 22.54 + index,
      longitude: 114.05 + index,
      network: "China Telecom",
    },
    tags: [index === 3 ? "datacenter-network" : "eyeball-network"],
    resolvers: [],
  }));
}

function makeShanghaiProbes(): GlobalpingProbe[] {
  return makeChinaProbes(4).map((probe, index) => ({
    ...probe,
    location: {
      ...probe.location,
      city: ["Shanghai", "Beijing", "Guangzhou", "Shenzhen"][index] || probe.location.city,
    },
  }));
}

function globalpingMeasurement(status: TraceResultResponse["status"]): GlobalpingMeasurement {
  return {
    id: "m123",
    type: "mtr",
    target: "globalping.io",
    status: status === "error" ? "failed" : status,
    probesCount: 1,
    results: [],
  };
}

function traceResult(
  status: TraceResultResponse["status"],
  enrichmentStatus: TraceResultResponse["enrichment"]["status"] = "skipped",
): TraceResultResponse {
  return {
    measurementId: "m123",
    type: "mtr",
    target: "globalping.io",
    status,
    probesCount: 1,
    results: [],
    enrichment: { status: enrichmentStatus, cached: 0, fetched: 0, errors: [] },
  };
}

function traceResultFromMeasurement(
  measurement: GlobalpingMeasurement | undefined,
  enrichmentStatus: TraceResultResponse["enrichment"]["status"] = "skipped",
): TraceResultResponse {
  if (!measurement) return traceResult("finished", enrichmentStatus);
  return {
    ...measurementToTraceResponse(measurement),
    enrichment: { status: enrichmentStatus, cached: 0, fetched: 0, errors: [] },
  };
}

function globalpingMeasurementWithHop(status: TraceResultResponse["status"]): GlobalpingMeasurement {
  const measurement = globalpingMeasurement(status);
  if (status !== "finished") return measurement;
  return {
    ...measurement,
    results: [
      {
        probe: {
          ...probes[0].location,
          tags: probes[0].tags,
          resolvers: probes[0].resolvers || [],
        },
        result: {
          status: "finished",
          resolvedAddress: FALLBACK_HOP_IP,
          resolvedHostname: null,
          rawOutput: "Host Loss% Avg",
          hops: [
            {
              resolvedAddress: FALLBACK_HOP_IP,
              resolvedHostname: null,
              timings: [{ rtt: 1.2 }],
              stats: { min: 1, avg: 1.2, max: 2, total: 1, rcv: 1, drop: 0, loss: 0 },
            },
          ],
        },
      },
    ],
  };
}

const FALLBACK_HOP_IP = "206.83.141.0";

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const probes: GlobalpingProbe[] = [
  {
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
  },
  {
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
  },
];
