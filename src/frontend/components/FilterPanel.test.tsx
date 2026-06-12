import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { filterChips } from "../../shared/filters";
import { FilterPanel } from "./FilterPanel";
import type { TraceFilters } from "../../shared/types";

const MAGIC_SUGGESTIONS = [
  "Los Angeles+US+AS7922+eyeball-network",
  "Falkenstein+DE+AS24940+datacenter-network",
];

describe("FilterPanel", () => {
  it("shows active filters, advanced controls, and reset action", () => {
    const filters: TraceFilters = { country: "US", city: "Los Angeles", eyeball: true };
    const onReset = vi.fn();
    const onFiltersChange = vi.fn();

    render(
      <FilterPanel
        target="globalping.io"
        protocol="ICMP"
        ipVersion=""
        port=""
        packets={3}
        limit={3}
        filters={filters}
        chips={filterChips(filters)}
        visibleProbes={12}
        totalProbes={120}
        probesStatus="ready"
        quotaLabel="quota 9 / 10"
        selectionNotice="已从地图选择 US+Los Angeles+AS7922"
        loading={false}
        turnstileSiteKey=""
        canSubmit={true}
        globalpingTokenDraft=""
        globalpingTokenSaved={false}
        nexttraceTokenDraft=""
        nexttraceTokenSaved={false}
        themeMode="system"
        onTargetChange={vi.fn()}
        onProtocolChange={vi.fn()}
        onIpVersionChange={vi.fn()}
        onPortChange={vi.fn()}
        onPacketsChange={vi.fn()}
        onLimitChange={vi.fn()}
        onFiltersChange={onFiltersChange}
        onGlobalpingTokenDraftChange={vi.fn()}
        onSaveGlobalpingToken={vi.fn()}
        onClearGlobalpingToken={vi.fn()}
        onNexttraceTokenDraftChange={vi.fn()}
        onSaveNexttraceToken={vi.fn()}
        onClearNexttraceToken={vi.fn()}
        onCycleThemeMode={vi.fn()}
        onNavigateHome={vi.fn()}
        onNavigateAbout={vi.fn()}
        onReset={onReset}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Globalping x NextTrace 的全球路由追踪")).toBeInTheDocument();
    expect(screen.getByText("当前筛选")).toBeInTheDocument();
    const chips = within(screen.getByTestId("filter-chips"));
    expect(chips.getByText("国家/地区")).toBeInTheDocument();
    expect(chips.getByText("US")).toBeInTheDocument();
    expect(screen.getByText("12 / 120 probes 匹配")).toBeInTheDocument();
    expect(screen.getByText("已从地图选择 US+Los Angeles+AS7922")).toBeInTheDocument();
    expect(screen.getByText("本地模式，无 Turnstile site key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "主题：System" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "切换到 2D 视图" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "切换到 3D 视图" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("magic string")).toBeVisible();
    expect(screen.getByLabelText("eyeball")).not.toBeVisible();
    expect(screen.getByLabelText("datacenter")).not.toBeVisible();
    expect(screen.getByLabelText("Globalping Token")).not.toBeVisible();
    expect(screen.getByText(/Powered by/)).toBeInTheDocument();
    expect(screen.getByText("×")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Globalping" })).toHaveAttribute("href", "https://globalping.io/");
    expect(screen.getByRole("link", { name: "NextTrace" })).toHaveAttribute("href", "https://www.nxtrace.org/");
    expect(screen.queryByRole("link", { name: "GlobalTrace GitHub" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));
    expect(onReset).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("高级参数与精确筛选"));
    expect(screen.getByLabelText("国家/地区")).toBeVisible();
    expect(screen.getByLabelText("ASN")).toBeVisible();
    expect(screen.getByLabelText("network")).toBeVisible();
    expect(screen.getByLabelText("tag")).toBeVisible();
    expect(screen.getByLabelText("eyeball")).toBeVisible();
    expect(screen.getByLabelText("datacenter")).toBeVisible();
    const advancedPanel = screen.getByText("高级参数与精确筛选").closest("details") as HTMLElement;
    expect(within(advancedPanel).queryByLabelText("magic string")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Globalping Token")).toBeVisible();
    expect(screen.getByText("未使用 Globalping Token")).toBeVisible();
    expect(screen.getByLabelText("NextTrace API Token")).toBeVisible();
    expect(screen.getByText("未使用 NextTrace Token")).toBeVisible();
    expect(screen.getByRole("link", { name: "获取 NextTrace API Token" })).toHaveAttribute(
      "href",
      "https://api.nxtrace.org/v4/api-tokens",
    );
    fireEvent.change(screen.getByLabelText("magic string"), { target: { value: "DE+Hetzner" } });
    expect(onFiltersChange).toHaveBeenCalledWith({ magic: "DE+Hetzner" });
  });

  it("updates network type filters and protocol controls", () => {
    const onFiltersChange = vi.fn();
    const onProtocolChange = vi.fn();
    renderPanel({ onFiltersChange, onProtocolChange });

    fireEvent.change(screen.getByLabelText("协议"), { target: { value: "TCP" } });
    fireEvent.click(screen.getByText("高级参数与精确筛选"));
    fireEvent.click(screen.getByLabelText("eyeball"));

    expect(onProtocolChange).toHaveBeenCalledWith("TCP");
    expect(onFiltersChange).toHaveBeenCalledWith({ magic: undefined, eyeball: true });
  });

  it("keeps run controls in the footer when the magic summary is long", () => {
    const magic = Array.from({ length: 12 }, (_, index) => `Novosibirsk-${index}+RU+AS${21000 + index}+datacenter-network`).join(
      ", ",
    );
    renderPanel({
      filters: { magic },
      chips: filterChips({ magic }),
      selectionNotice: "框选 12 个 probes，已按上限取前 10 个",
    });

    const chips = screen.getByTestId("filter-chips");
    expect(chips).toHaveTextContent("Novosibirsk-0+RU+AS21000+datacenter-network");
    expect(within(chips).queryByText("magic")).not.toBeInTheDocument();
    const magicSummary = within(chips).getByText(magic);
    expect(magicSummary.closest(".filter-chip")).toBeNull();
    expect(magicSummary.closest(".filter-magic-summary")).not.toBeNull();
    expect(screen.getByText("当前筛选")).toBeInTheDocument();
    const footer = screen.getByTestId("filter-panel-footer");
    expect(within(footer).getByRole("button", { name: "开始网络路径诊断" })).toBeInTheDocument();
  });

  it("updates IP version selection", () => {
    const onIpVersionChange = vi.fn();
    renderPanel({ ipVersion: "", onIpVersionChange });

    expect(screen.getByLabelText("IP 版本")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("IP 版本"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("IP 版本"), { target: { value: "" } });

    expect(onIpVersionChange).toHaveBeenNthCalledWith(1, 6);
    expect(onIpVersionChange).toHaveBeenNthCalledWith(2, "");
  });

  it("shows the example placeholder instead of default world magic", () => {
    renderPanel();

    const magicInput = screen.getByLabelText("magic string");
    expect(magicInput).toHaveValue("");
    expect(magicInput).toHaveAttribute("placeholder", "US+Comcast+eyeball-network, DE+Hetzner");
    expect(screen.getByTestId("filter-chips")).toHaveTextContent("world");
  });

  it("shows magic string suggestions and selects them with the keyboard", () => {
    const onFiltersChange = vi.fn();
    renderPanel({
      filterSuggestions: {
        countries: [],
        cities: [],
        asns: [],
        networks: [],
        magicStrings: MAGIC_SUGGESTIONS,
      },
      onFiltersChange,
    });

    const magicInput = screen.getByLabelText("magic string");
    fireEvent.focus(magicInput);
    expectSuggestionOptions(MAGIC_SUGGESTIONS);

    fireEvent.keyDown(magicInput, { key: "ArrowDown" });
    fireEvent.keyDown(magicInput, { key: "Enter" });

    expect(onFiltersChange).toHaveBeenCalledWith({ magic: "Falkenstein+DE+AS24940+datacenter-network" });
  });

  it("filters magic suggestions by the current comma-separated segment", () => {
    const onFiltersChange = vi.fn();
    renderPanel({
      filters: { magic: "US, AS24940+Falk" },
      chips: filterChips({ magic: "US, AS24940+Falk" }),
      filterSuggestions: {
        countries: [],
        cities: [],
        asns: [],
        networks: [],
        magicStrings: MAGIC_SUGGESTIONS,
      },
      onFiltersChange,
    });

    const magicInput = screen.getByLabelText("magic string") as HTMLTextAreaElement;
    magicInput.setSelectionRange(magicInput.value.length, magicInput.value.length);
    fireEvent.focus(magicInput);

    expectSuggestionOptions(["Falkenstein+DE+AS24940+datacenter-network"]);

    fireEvent.mouseDown(screen.getByRole("option", { name: "Falkenstein+DE+AS24940+datacenter-network" }));

    expect(onFiltersChange).toHaveBeenCalledWith({ magic: "US, Falkenstein+DE+AS24940+datacenter-network" });
  });

  it("clears magic when structured filters are edited", () => {
    const onFiltersChange = vi.fn();
    renderPanel({ filters: { magic: "DE+AS24940" }, chips: filterChips({ magic: "DE+AS24940" }), onFiltersChange });

    fireEvent.click(screen.getByText("高级参数与精确筛选"));
    fireEvent.change(screen.getByLabelText("国家/地区"), { target: { value: "US" } });
    fireEvent.change(screen.getByLabelText("ASN"), { target: { value: "7922" } });
    fireEvent.change(screen.getByLabelText("network"), { target: { value: "Comcast" } });

    expect(onFiltersChange).toHaveBeenNthCalledWith(1, { magic: undefined, country: "US" });
    expect(onFiltersChange).toHaveBeenNthCalledWith(2, { magic: undefined, asn: "7922" });
    expect(onFiltersChange).toHaveBeenNthCalledWith(3, { magic: undefined, network: "Comcast" });
  });

  it("connects online probe suggestions to structured filter inputs", () => {
    const onFiltersChange = vi.fn();
    renderPanel({
      filters: {},
      chips: filterChips({}),
      filterSuggestions: {
        countries: ["DE", "US"],
        cities: ["Falkenstein", "Los Angeles"],
        asns: ["AS7922", "AS24940"],
        networks: ["Comcast", "Hetzner Online"],
        magicStrings: MAGIC_SUGGESTIONS,
      },
      onFiltersChange,
    });

    fireEvent.click(screen.getByText("高级参数与精确筛选"));

    expect(document.querySelector("datalist")).toBeNull();

    const countryInput = screen.getByLabelText("国家/地区");
    fireEvent.focus(countryInput);
    expectSuggestionOptions(["DE", "US"]);
    fireEvent.blur(countryInput);

    const networkInput = screen.getByLabelText("network");
    fireEvent.focus(networkInput);
    fireEvent.mouseDown(screen.getByRole("option", { name: "Hetzner Online" }));
    expect(onFiltersChange).toHaveBeenCalledWith({ magic: undefined, network: "Hetzner Online" });

    const asnInput = screen.getByLabelText("ASN");
    fireEvent.focus(asnInput);
    fireEvent.keyDown(asnInput, { key: "ArrowDown" });
    fireEvent.keyDown(asnInput, { key: "Enter" });
    expect(onFiltersChange).toHaveBeenCalledWith({ magic: undefined, asn: "AS24940" });
  });

  it("filters visible suggestions by the current input without blocking free text", () => {
    const onFiltersChange = vi.fn();
    renderPanel({
      filters: { network: "com" },
      chips: filterChips({ network: "com" }),
      filterSuggestions: {
        countries: ["DE", "US"],
        cities: ["Falkenstein", "Los Angeles"],
        asns: ["AS7922", "AS24940"],
        networks: ["Comcast", "Hetzner Online"],
        magicStrings: MAGIC_SUGGESTIONS,
      },
      onFiltersChange,
    });

    fireEvent.click(screen.getByText("高级参数与精确筛选"));
    const networkInput = screen.getByLabelText("network");
    fireEvent.focus(networkInput);

    expectSuggestionOptions(["Comcast"]);

    fireEvent.change(networkInput, { target: { value: "custom network" } });
    expect(onFiltersChange).toHaveBeenCalledWith({ magic: undefined, network: "custom network" });
  });

  it("preserves spaces while editing network filters", () => {
    const onFiltersChange = vi.fn();
    renderPanel({ filters: {}, chips: filterChips({}), onFiltersChange });

    fireEvent.click(screen.getByText("高级参数与精确筛选"));
    fireEvent.change(screen.getByLabelText("network"), { target: { value: "Hetzner Online " } });
    fireEvent.change(screen.getByLabelText("network"), { target: { value: "   " } });

    expect(onFiltersChange).toHaveBeenNthCalledWith(1, { magic: undefined, network: "Hetzner Online " });
    expect(onFiltersChange).toHaveBeenNthCalledWith(2, { magic: undefined, network: undefined });
  });

  it("disables the run action and shows loading/error statuses", () => {
    renderPanel({ loading: true, probesStatus: "error", quotaLabel: "诊断额度暂不可用" });

    expect(screen.getByRole("button", { name: "开始网络路径诊断" })).toBeDisabled();
    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.getByText("probes 读取失败")).toBeInTheDocument();
    expect(screen.getByText("诊断额度暂不可用")).toBeInTheDocument();
  });

  it("keeps the run action available when Turnstile is configured", () => {
    const first = renderPanel({ turnstileSiteKey: "site-key", canSubmit: true });

    expect(screen.getByText("Turnstile 已配置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始网络路径诊断" })).toBeEnabled();

    first.unmount();
    renderPanel({ turnstileSiteKey: "site-key", canSubmit: false });

    expect(screen.getByRole("button", { name: "开始网络路径诊断" })).toBeDisabled();
  });

  it("updates token controls, theme, and about actions", () => {
    const onGlobalpingTokenDraftChange = vi.fn();
    const onSaveGlobalpingToken = vi.fn();
    const onClearGlobalpingToken = vi.fn();
    const onNexttraceTokenDraftChange = vi.fn();
    const onSaveNexttraceToken = vi.fn();
    const onClearNexttraceToken = vi.fn();
    const onCycleThemeMode = vi.fn();
    const onNavigateAbout = vi.fn();
    renderPanel({
      globalpingTokenDraft: "gp-token",
      globalpingTokenSaved: true,
      nexttraceTokenDraft: "nt-token",
      nexttraceTokenSaved: true,
      themeMode: "dark",
      onGlobalpingTokenDraftChange,
      onSaveGlobalpingToken,
      onClearGlobalpingToken,
      onNexttraceTokenDraftChange,
      onSaveNexttraceToken,
      onClearNexttraceToken,
      onCycleThemeMode,
      onNavigateAbout,
    });

    fireEvent.click(screen.getByText("高级参数与精确筛选"));
    fireEvent.change(screen.getByLabelText("Globalping Token"), { target: { value: "next-token" } });
    fireEvent.change(screen.getByLabelText("NextTrace API Token"), { target: { value: "nexttrace-token" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 Globalping" }));
    fireEvent.click(screen.getByRole("button", { name: "清除 Globalping" }));
    fireEvent.click(screen.getByRole("button", { name: "保存 NextTrace" }));
    fireEvent.click(screen.getByRole("button", { name: "清除 NextTrace" }));
    fireEvent.click(screen.getByRole("button", { name: "主题：Dark" }));
    fireEvent.click(screen.getByRole("button", { name: "关于 GlobalTrace" }));

    expect(screen.getByText("Globalping Token 已保存到本机浏览器")).toBeInTheDocument();
    expect(screen.getByText("NextTrace Token 已保存到本机浏览器")).toBeInTheDocument();
    expect(onGlobalpingTokenDraftChange).toHaveBeenCalledWith("next-token");
    expect(onNexttraceTokenDraftChange).toHaveBeenCalledWith("nexttrace-token");
    expect(onSaveGlobalpingToken).toHaveBeenCalledTimes(1);
    expect(onClearGlobalpingToken).toHaveBeenCalledTimes(1);
    expect(onSaveNexttraceToken).toHaveBeenCalledTimes(1);
    expect(onClearNexttraceToken).toHaveBeenCalledTimes(1);
    expect(onCycleThemeMode).toHaveBeenCalledTimes(1);
    expect(onNavigateAbout).toHaveBeenCalledTimes(1);
  });

  it("navigates home from the brand link", () => {
    const onNavigateHome = vi.fn();
    renderPanel({ onNavigateHome });

    fireEvent.click(screen.getByRole("link", { name: "返回首页" }));

    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });
});

function renderPanel(overrides: Partial<ComponentProps<typeof FilterPanel>> = {}) {
  const filters: TraceFilters = { magic: "world" };
  return render(
    <FilterPanel
      target="globalping.io"
      protocol="ICMP"
      ipVersion=""
      port=""
      packets={3}
      limit={3}
      filters={filters}
      chips={filterChips(filters)}
      visibleProbes={12}
      totalProbes={120}
      probesStatus="ready"
      quotaLabel="quota 9 / 10"
      selectionNotice=""
      loading={false}
      turnstileSiteKey=""
      canSubmit={true}
      globalpingTokenDraft=""
      globalpingTokenSaved={false}
      nexttraceTokenDraft=""
      nexttraceTokenSaved={false}
      themeMode="system"
      onTargetChange={vi.fn()}
      onProtocolChange={vi.fn()}
      onIpVersionChange={vi.fn()}
      onPortChange={vi.fn()}
      onPacketsChange={vi.fn()}
      onLimitChange={vi.fn()}
      onFiltersChange={vi.fn()}
      onGlobalpingTokenDraftChange={vi.fn()}
      onSaveGlobalpingToken={vi.fn()}
      onClearGlobalpingToken={vi.fn()}
      onNexttraceTokenDraftChange={vi.fn()}
      onSaveNexttraceToken={vi.fn()}
      onClearNexttraceToken={vi.fn()}
      onCycleThemeMode={vi.fn()}
      onNavigateHome={vi.fn()}
      onNavigateAbout={vi.fn()}
      onReset={vi.fn()}
      onSubmit={vi.fn()}
      {...overrides}
    />,
  );
}

function expectSuggestionOptions(values: string[]) {
  const listbox = screen.getByRole("listbox", { name: "候选列表" });
  expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual(values);
}
