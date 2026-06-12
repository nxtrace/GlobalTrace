import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, POLL_DELAY_MS, TRACE_MAX_POLL_ATTEMPTS } from "./App";
import type { GlobalpingProbe, TraceResultResponse } from "../shared/types";
import type { GlobalpingMeasurement } from "../shared/globalping";

vi.mock("./components/ProbeMap", () => ({
  ProbeMap: (props: {
    probes: GlobalpingProbe[];
    selectionNotice: string;
    onPickProbe: (probe: GlobalpingProbe) => void;
    onBoxSelect: (probes: GlobalpingProbe[]) => void;
  }) => (
    <section aria-label="mock probe map">
      <span>{props.selectionNotice || "no selection"}</span>
      <span>probe-projection:mercator</span>
      <span>box:on</span>
      <button type="button" onClick={() => props.onPickProbe(props.probes[0])}>
        pick first probe
      </button>
      <button type="button" onClick={() => props.onBoxSelect(repeatProbes(props.probes[0], 12))}>
        box many probes
      </button>
    </section>
  ),
}));

vi.mock("./components/ResultsView", () => ({
  ResultsView: ({
    result,
    mapProjection,
    onMapProjectionChange,
    onClose,
  }: {
    result: TraceResultResponse | null;
    mapProjection?: "mercator" | "globe";
    onMapProjectionChange?: (value: "mercator" | "globe") => void;
    onClose?: () => void;
  }) => (
    <section aria-label="mock results">
      {result ? `result:${result.status}:${result.measurementId}` : "no result"}
      <span>{`projection:${mapProjection || "mercator"}`}</span>
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
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage?.clear();
  document.querySelectorAll("script[data-turnstile]").forEach((script) => script.remove());
  document.documentElement.removeAttribute("data-theme");
  delete window.turnstile;
  window.history.replaceState(null, "", "/");
});

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
    expect(screen.getByText("可创建诊断 249/250（当前 IP）")).toBeInTheDocument();
    expect(screen.getByText("249/250")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("system");
  });

  it("keeps probe selection in 2D and persists the result map projection locally", async () => {
    mockApi();

    render(<App />);

    expect(await screen.findByLabelText("mock probe map")).toBeInTheDocument();
    expect(window.localStorage.getItem("globaltrace.viewMode")).toBe("2d");
    expect(screen.queryByRole("button", { name: "切换结果地图到 3D" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    expect(await screen.findByText("result:finished:m123", {}, { timeout: 3_000 })).toBeInTheDocument();
    expect(screen.queryByLabelText("mock probe map")).not.toBeInTheDocument();
    expect(screen.getByText("projection:mercator")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "切换结果地图到 3D" }));
    expect(screen.getByText("projection:globe")).toBeInTheDocument();
    expect(window.localStorage.getItem("globaltrace.viewMode")).toBe("3d");

    fireEvent.click(screen.getByRole("button", { name: "关闭结果" }));
    expect(await screen.findByLabelText("mock probe map")).toBeInTheDocument();
    expect(screen.getByText("probe-projection:mercator")).toBeInTheDocument();
    expect(screen.getByText("box:on")).toBeInTheDocument();
  });

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

  it("saves a Globalping token locally and sends it only to Globalping", async () => {
    const fetchMock = mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(screen.getByText("高级参数与精确筛选"));
    fireEvent.change(screen.getByLabelText("Globalping Token"), { target: { value: "  gp-token  " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(window.localStorage.getItem("globaltrace.globalpingToken")).toBe("gp-token");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.globalping.io/v1/limits",
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer gp-token" }),
        }),
      );
    });
    expect(screen.getByText("已保存到本机浏览器")).toBeInTheDocument();

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

  it("renders the about route with attribution links", async () => {
    window.history.replaceState(null, "", "/about");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "GlobalTrace" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "GlobalTrace 是一个 Globalping x NextTrace 的开源项目，借助 Globalping 遍布全球的 Probe 发起路由追踪，并结合 NextTrace 骨干网 IP 数据库增强地理位置与网络归属信息。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Globalping API docs/ })).toHaveAttribute(
      "href",
      "https://globalping.io/docs/api.globalping.io",
    );
    expect(screen.getByRole("link", { name: /NTrace-core GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/nxtrace/NTrace-core",
    );
    expect(screen.getByRole("link", { name: /GlobalTrace GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/nxtrace/GlobalTrace",
    );
    expect(screen.getByRole("heading", { name: "开源协议" })).toBeInTheDocument();
    expect(screen.getByText("GlobalTrace 以 GPL-3.0-or-later 开源发布。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GPL-3.0-or-later/ })).toHaveAttribute(
      "href",
      "https://github.com/nxtrace/GlobalTrace/blob/master/LICENSE",
    );
    expect(screen.getByRole("link", { name: "源码" })).toHaveAttribute("href", "https://github.com/nxtrace/GlobalTrace");
  });

  it("updates filters when a map probe is selected", async () => {
    mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(await screen.findByRole("button", { name: "pick first probe" }));

    await waitFor(() => {
      expect(screen.getAllByText("已选择 Los Angeles · AS7922").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("1 / 2 probes 匹配")).toBeInTheDocument();
    const chips = screen.getByTestId("filter-chips");
    expect(chips).toHaveTextContent("Los Angeles+US+AS7922+eyeball-network");
    expect(within(chips).queryByText("magic")).not.toBeInTheDocument();
  });

  it("narrows field suggestions with other structured filters", async () => {
    mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(screen.getByText("高级参数与精确筛选"));
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

  it("caps box selection at ten probes and updates the probe limit", async () => {
    const fetchMock = mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(await screen.findByRole("button", { name: "box many probes" }));

    await waitFor(() => {
      expect(screen.getAllByText("框选 12 个 probes，已按上限取前 10 个").length).toBeGreaterThan(0);
    });
    expect(screen.getByLabelText("probes")).toHaveValue(10);

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
    expect(screen.queryByLabelText("mock probe map")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?measurement=m123");
    expect(fetchMock).toHaveBeenCalledWith("https://api.globalping.io/v1/measurements", expect.objectContaining({ method: "POST" }));
    expect(traceCreateBodies(fetchMock)[0].measurementOptions).not.toHaveProperty("ipVersion");
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

  it("opens Turnstile after submit and uses a fresh token for each trace", async () => {
    const fetchMock = mockApi({ traceStatus: () => "finished", turnstileSiteKey: "site-key" });
    let callback: ((token: string) => void) | undefined;
    let tokenCount = 0;
    const issueToken = () => {
      tokenCount += 1;
      callback?.(`turnstile-token-${tokenCount}`);
    };
    window.turnstile = {
      render: vi.fn((element, options) => {
        callback = options.callback;
        const widget = document.createElement("div");
        widget.className = "mock-turnstile-widget";
        element.appendChild(widget);
        window.setTimeout(issueToken, 0);
        return "widget-id";
      }),
      reset: vi.fn(),
    };

    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    expect(screen.queryByText("验证后开始诊断")).not.toBeInTheDocument();
    expect(document.querySelector(".mock-turnstile-widget")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始网络路径诊断" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(await screen.findByRole("dialog", { name: "验证后开始诊断" })).toBeInTheDocument();
    await waitFor(() => expect(tokenCount).toBe(1));
    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    await waitFor(() => expect(traceEnrichBodies(fetchMock)).toHaveLength(1));
    expect(traceEnrichBodies(fetchMock)[0].turnstileToken).toBe("turnstile-token-1");
    expect(window.turnstile?.reset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(await screen.findByRole("dialog", { name: "验证后开始诊断" })).toBeInTheDocument();
    await waitFor(() => expect(tokenCount).toBe(2));
    await waitFor(() => expect(traceEnrichBodies(fetchMock)).toHaveLength(2));
    expect(traceEnrichBodies(fetchMock).map((body) => body.turnstileToken)).toEqual([
      "turnstile-token-1",
      "turnstile-token-2",
    ]);
  });

  it("opens Turnstile immediately for shared results and uses a fresh token for the next trace", async () => {
    const fetchMock = mockApi({ traceStatus: () => "finished", turnstileSiteKey: "site-key" });
    let callback: ((token: string) => void) | undefined;
    let tokenCount = 0;
    const issueToken = () => {
      tokenCount += 1;
      callback?.(`turnstile-token-${tokenCount}`);
    };
    window.turnstile = {
      render: vi.fn((element, options) => {
        callback = options.callback;
        const widget = document.createElement("div");
        widget.className = "mock-turnstile-widget";
        element.appendChild(widget);
        window.setTimeout(issueToken, 0);
        return "widget-id";
      }),
      reset: vi.fn(),
    };
    window.history.replaceState(null, "", "/?measurement=m123");

    render(<App />);

    expect(await screen.findByRole("dialog", { name: "验证后打开分享结果" })).toBeInTheDocument();
    await waitFor(() => expect(tokenCount).toBe(1));
    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    await waitFor(() => expect(traceEnrichBodies(fetchMock)).toHaveLength(1));
    expect(traceEnrichBodies(fetchMock)[0].turnstileToken).toBe("turnstile-token-1");
    expect(window.turnstile?.reset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(await screen.findByRole("dialog", { name: "验证后开始诊断" })).toBeInTheDocument();
    await waitFor(() => expect(tokenCount).toBe(2));
    await waitFor(() => expect(traceEnrichBodies(fetchMock)).toHaveLength(2));
    expect(traceEnrichBodies(fetchMock).map((body) => body.turnstileToken)).toEqual([
      "turnstile-token-1",
      "turnstile-token-2",
    ]);
  });

  it("keeps an enriched shared result if Turnstile expires after the dialog closes", async () => {
    const fetchMock = mockApi({
      traceStatus: () => "finished",
      turnstileSiteKey: "site-key",
      enrichmentStatus: "complete",
    });
    let callback: ((token: string) => void) | undefined;
    let expiredCallback: (() => void) | undefined;
    window.turnstile = {
      render: vi.fn((element, options) => {
        callback = options.callback;
        expiredCallback = options["expired-callback"];
        const widget = document.createElement("div");
        widget.className = "mock-turnstile-widget";
        element.appendChild(widget);
        window.setTimeout(() => callback?.("turnstile-token-1"), 0);
        return "widget-id";
      }),
      reset: vi.fn(),
    };
    window.history.replaceState(null, "", "/?measurement=m123");

    render(<App />);

    expect(await screen.findByRole("dialog", { name: "验证后打开分享结果" })).toBeInTheDocument();
    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    await waitFor(() => expect(traceEnrichBodies(fetchMock)).toHaveLength(1));
    expect(traceEnrichBodies(fetchMock).map((body) => body.turnstileToken)).toEqual(["turnstile-token-1"]);

    act(() => {
      expiredCallback?.();
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(screen.getByText("result:finished:m123")).toBeInTheDocument();
    expect(traceEnrichBodies(fetchMock).map((body) => body.turnstileToken)).toEqual(["turnstile-token-1"]);
  });

  it("does not create a trace before Turnstile produces a token", async () => {
    const fetchMock = mockApi({ turnstileSiteKey: "site-key" });

    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    expect(screen.getByRole("button", { name: "开始网络路径诊断" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    expect(screen.getByRole("dialog", { name: "验证后开始诊断" })).toBeInTheDocument();
    expect(screen.getByText("等待验证")).toBeInTheDocument();
    expect(traceCreateBodies(fetchMock)).toHaveLength(0);
  });

  it("cancels homepage Turnstile without creating a trace", async () => {
    const fetchMock = mockApi({ turnstileSiteKey: "site-key" });
    window.turnstile = {
      render: vi.fn((element) => {
        const widget = document.createElement("div");
        widget.className = "mock-turnstile-widget";
        element.appendChild(widget);
        return "widget-id";
      }),
      reset: vi.fn(),
    };

    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    expect(await screen.findByRole("dialog", { name: "验证后开始诊断" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "验证后开始诊断" })).not.toBeInTheDocument());
    expect(await screen.findByLabelText("mock probe map")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始网络路径诊断" })).toBeEnabled();
    expect(traceCreateBodies(fetchMock)).toHaveLength(0);
  });

  it("cancels and retries shared Turnstile", async () => {
    const fetchMock = mockApi({ traceStatus: () => "finished", turnstileSiteKey: "site-key" });
    let callback: ((token: string) => void) | undefined;
    window.turnstile = {
      render: vi.fn((element, options) => {
        callback = options.callback;
        const widget = document.createElement("div");
        widget.className = "mock-turnstile-widget";
        element.appendChild(widget);
        return "widget-id";
      }),
      reset: vi.fn(),
    };
    window.history.replaceState(null, "", "/?measurement=m123");

    render(<App />);

    expect(await screen.findByRole("dialog", { name: "验证后打开分享结果" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "验证后打开分享结果" })).not.toBeInTheDocument());
    expect(screen.getByText("需要完成人机验证")).toBeInTheDocument();
    expect(screen.getByText("完成 Turnstile 后会自动打开分享结果。")).toBeInTheDocument();
    expect(traceEnrichBodies(fetchMock)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "继续验证" }));
    expect(await screen.findByRole("dialog", { name: "验证后打开分享结果" })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector(".mock-turnstile-widget")).toBeInTheDocument());
    act(() => {
      callback?.("turnstile-token-1");
    });

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    await waitFor(() => expect(traceEnrichBodies(fetchMock)).toHaveLength(1));
    expect(traceEnrichBodies(fetchMock)[0].turnstileToken).toBe("turnstile-token-1");
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
        if (path === "/api/config") return json({ turnstileSiteKey: "", mapStyleUrl: "about:blank" });
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

    expect(await screen.findByRole("status", { name: "正在打开分享结果" })).toBeInTheDocument();
    expect(screen.getByText("正在读取 Globalping measurement，完成后会自动展示结果。")).toBeInTheDocument();
    expect(screen.queryByLabelText("mock probe map")).not.toBeInTheDocument();

    measurementResponse.resolve(json(globalpingMeasurement("finished")));

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
  });

  it("submits selected IP version and reset restores automatic mode", async () => {
    const fetchMock = mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");
    fireEvent.change(screen.getByLabelText("IP 版本"), { target: { value: "6" } });
    expect(screen.getByLabelText("IP 版本")).toHaveValue("6");

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();
    expect(traceCreateBodies(fetchMock)[0].measurementOptions.ipVersion).toBe(6);

    fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));
    expect(screen.getByLabelText("IP 版本")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));

    await waitFor(() => {
      expect(traceCreateBodies(fetchMock)).toHaveLength(2);
    });
    expect(traceCreateBodies(fetchMock)[1].measurementOptions).not.toHaveProperty("ipVersion");
  });

  it("keeps probe selection visible while polling, then lets users close and reopen results", async () => {
    const fetchMock = mockApi();
    render(<App />);

    await screen.findByText("2 / 2 probes 匹配");

    fireEvent.click(screen.getByRole("button", { name: "开始网络路径诊断" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("https://api.globalping.io/v1/measurements/m123", expect.anything());
    });
    expect(await screen.findByLabelText("mock probe map")).toBeInTheDocument();
    expect(screen.queryByLabelText("mock results")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看结果" })).not.toBeInTheDocument();

    expect(await screen.findByText("result:finished:m123")).toBeInTheDocument();

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
          return json({ turnstileSiteKey: "", mapStyleUrl: "about:blank" });
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
    expect(screen.getByText("诊断额度暂不可用")).toBeInTheDocument();
  });

  it("turns upstream parameter validation failures into actionable copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/config") return json({ turnstileSiteKey: "", mapStyleUrl: "about:blank" });
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
    traceStatus?: (polls: number) => TraceResultResponse["status"];
    turnstileSiteKey?: string;
    enrichmentStatus?: TraceResultResponse["enrichment"]["status"];
  } = {},
) {
  let tracePolls = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/config") {
      return json({ turnstileSiteKey: options.turnstileSiteKey || "", mapStyleUrl: "about:blank" });
    }
    if (path === "/api/probes") {
      return json({ probes, fetchedAt: "2026-06-09T00:00:00.000Z" });
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
      return new Response(null, { status: 204 });
    }
    if (path === "https://api.globalping.io/v1/measurements/m123") {
      tracePolls += 1;
      const status = options.traceStatus?.(tracePolls) ?? (tracePolls === 1 ? "in-progress" : "finished");
      return json(globalpingMeasurement(status));
    }
    if (path === "/api/trace/enrich" && init?.method === "POST") {
      return json(traceResult("finished", options.enrichmentStatus));
    }
    throw new Error(`unexpected fetch: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function traceCreateBodies(fetchMock: ReturnType<typeof mockApi>): Array<{
  locations: Array<{ magic: string }>;
  measurementOptions: { ipVersion?: 4 | 6 };
}> {
  return fetchMock.mock.calls
    .filter(([path, init]) => path === "https://api.globalping.io/v1/measurements" && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)));
}

function traceEnrichBodies(fetchMock: ReturnType<typeof mockApi>): Array<{ turnstileToken?: string }> {
  return fetchMock.mock.calls
    .filter(([path, init]) => path === "/api/trace/enrich" && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)));
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
