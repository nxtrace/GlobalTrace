import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filterChips } from "../../shared/filters";
import { FilterPanel } from "./FilterPanel";
import type { TraceFilters } from "../../shared/types";

const MAGIC_SUGGESTIONS = [
  "Los Angeles+US+AS7922+eyeball-network",
  "Falkenstein+DE+AS24940+datacenter-network",
];
const CHINA_MAGIC_SUGGESTIONS = [
  "CN+Shanghai",
  "CN+AS4134",
  "Shanghai+CN+AS4134+eyeball-network",
];
const CHINA_NETWORK_MAGIC_SUGGESTIONS = [
  "CN+Shanghai",
  "CN+AS4134",
  "CN+China Telecom",
  "CN+AS4134+China Telecom",
  "Shanghai+CN+China Telecom",
  "Shanghai+CN+AS4134+China Telecom",
  "Shanghai+CN+AS4134+eyeball-network",
];
const NETWORK_MAGIC_SUGGESTIONS = [
  "US+Los Angeles",
  "US+AS7922",
  "US+Comcast",
  "US+AS7922+Comcast",
  "Los Angeles+US+Comcast",
  "Los Angeles+US+AS7922+Comcast",
  "Los Angeles+US+AS7922+eyeball-network",
];

const exactFiltersPanel = () =>
  screen.getByText("精确筛选").closest("details") as HTMLDetailsElement;

const openExactFilters = () => {
  if (!exactFiltersPanel().open) fireEvent.click(screen.getByText("精确筛选"));
};

const openAdvancedParams = () => {
  fireEvent.click(screen.getByRole("button", { name: "打开高级参数" }));
};

describe("FilterPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows active filters, advanced controls, and reset action", () => {
    const filters: TraceFilters = {
      country: "US",
      city: "Los Angeles",
      eyeball: true,
    };
    const onReset = vi.fn();
    const onFiltersChange = vi.fn();

    render(
      <FilterPanel
        target="globalping.io"
        protocol="ICMP"
        ipVersion={4}
        port=""
        packets={5}
        limit={3}
        filters={filters}
        chips={filterChips(filters)}
        visibleProbes={12}
        totalProbes={120}
        probesStatus="ready"
        selectionNotice="已从地图选择 US+Los Angeles+AS7922"
        loading={false}
        canSubmit={true}
        globalpingTokenDraft=""
        globalpingTokenSaved={false}
        globalpingTokenRemembered={false}
        nexttraceTokenDraft=""
        nexttraceTokenSaved={false}
        nexttraceTokenRemembered={false}
        themeMode="system"
        liquidGlassEnabled={true}
        liquidGlassIntensity={70}
        resultContentOrder="table-first"
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
        onGlobalpingTokenRememberedChange={vi.fn()}
        onNexttraceTokenDraftChange={vi.fn()}
        onSaveNexttraceToken={vi.fn()}
        onClearNexttraceToken={vi.fn()}
        onNexttraceTokenRememberedChange={vi.fn()}
        onCycleThemeMode={vi.fn()}
        onLiquidGlassEnabledChange={vi.fn()}
        onLiquidGlassIntensityChange={vi.fn()}
        onResultContentOrderChange={vi.fn()}
        onNavigateHome={vi.fn()}
        onNavigateAbout={vi.fn()}
        onReset={onReset}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("全球路由追踪")).toBeInTheDocument();
    expect(screen.getByText("当前筛选")).toBeInTheDocument();
    const chips = within(screen.getByTestId("filter-chips"));
    expect(chips.getByText("国家/地区")).toBeInTheDocument();
    expect(chips.getByText("US")).toBeInTheDocument();
    expect(screen.getByText("12 / 120 probes 匹配")).toBeInTheDocument();
    expect(
      screen.getByText("已从地图选择 US+Los Angeles+AS7922"),
    ).toBeInTheDocument();
    const baseControls = screen.getByRole("region", { name: "基础参数" });
    expect(baseControls).toHaveClass(
      "primary-controls-surface",
      "primary-controls",
    );
    expect(baseControls.closest("[data-liquid-glass]")).toBeNull();
    expect(screen.getByLabelText("目标")).toHaveAttribute(
      "placeholder",
      "目标 IP 或域名，如 1.1.1.1、github.com",
    );
    expect(within(baseControls).queryByText("目标")).not.toBeInTheDocument();
    expect(within(baseControls).queryByText("协议")).not.toBeInTheDocument();
    expect(
      within(baseControls).queryByText("magic string"),
    ).not.toBeInTheDocument();
    expect(baseControls.querySelector(".parameter-pill-grid")).not.toBeNull();
    expect(baseControls.querySelector(".trace-options-row")).toBeNull();
    expect(screen.getByRole("button", { name: "IPv4" })).toBeInTheDocument();
    expect(screen.getByLabelText("Limit")).toHaveTextContent("3");
    expect(within(baseControls).getByLabelText("端口")).toHaveTextContent("");
    expect(within(baseControls).getByLabelText("Packets")).toHaveTextContent("5");
    expect(screen.queryByLabelText("probes")).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "开始网络路径诊断" })
        .closest("[data-liquid-glass]"),
    ).toHaveAttribute("data-liquid-glass-interactive", "true");
    expect(
      screen.getByRole("button", { name: "主题：System" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "切换到 2D 视图" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "切换到 3D 视图" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("magic string")).toBeVisible();
    expect(screen.getByLabelText("eyeball")).toBeVisible();
    expect(screen.getByLabelText("datacenter")).toBeVisible();
    expect(screen.queryByLabelText("液态玻璃效果")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Globalping Token")).not.toBeInTheDocument();
    expect(screen.getByText(/Powered by/)).toBeInTheDocument();
    expect(screen.getByText("×")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Globalping" })).toHaveAttribute(
      "href",
      "https://globalping.io/",
    );
    expect(screen.getByRole("link", { name: "NextTrace" })).toHaveAttribute(
      "href",
      "https://www.nxtrace.org/",
    );
    expect(
      screen.queryByRole("link", { name: "GlobalTrace GitHub" }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("link", { name: "关于 GlobalTrace" })
        .closest(".attribution-action-surface[data-liquid-glass]"),
    ).not.toBeNull();
    const advancedParamsButton = screen.getByRole("button", {
      name: "打开高级参数",
    });
    expect(advancedParamsButton.closest(".panel-title-actions")).not.toBeNull();
    expect(advancedParamsButton.closest("[data-liquid-glass]")).toHaveClass(
      "liquid-glass-iconButton",
    );
    expect(
      document.querySelector(".advanced-params-trigger-surface"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));
    expect(onReset).toHaveBeenCalledTimes(1);

    openExactFilters();
    expect(screen.getByLabelText("国家/地区")).toBeVisible();
    expect(screen.getByLabelText("ASN")).toBeVisible();
    expect(screen.getByLabelText("network")).toBeVisible();
    expect(screen.getByLabelText("tag")).toBeVisible();
    expect(screen.getByLabelText("eyeball")).toBeVisible();
    expect(screen.getByLabelText("datacenter")).toBeVisible();
    const advancedPanel = screen
      .getByText("精确筛选")
      .closest("details") as HTMLElement;
    expect(
      within(advancedPanel).queryByLabelText("magic string"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Globalping Token")).not.toBeInTheDocument();

    openAdvancedParams();
    const advancedDialog = screen.getByRole("dialog", { name: "高级参数" });
    expect(advancedDialog.closest(".glass-overlay-center")).not.toBeNull();
    expect(advancedDialog.closest(".glass-overlay-sheet")).toBeNull();
    expect(
      within(advancedDialog).getByRole("switch", { name: "液态玻璃效果" }),
    ).toBeChecked();
    expect(within(advancedDialog).getByText("结果页面显示顺序：")).toBeVisible();
    const layoutGroup = within(advancedDialog).getByRole("radiogroup", {
      name: "结果页面显示顺序",
    });
    const layoutOptions = within(layoutGroup).getAllByRole("radio");
    expect(layoutOptions[0]).toHaveAccessibleName("地图优先");
    expect(layoutOptions[1]).toHaveAccessibleName("表格优先");
    expect(
      within(layoutGroup).getByText("地图优先").closest("label")?.querySelector("svg"),
    ).not.toBeNull();
    expect(
      within(layoutGroup).getByText("表格优先").closest("label")?.querySelector("svg"),
    ).not.toBeNull();
    expect(
      within(layoutGroup).getByRole("radio", { name: "表格优先" }),
    ).toBeChecked();
    expect(
      within(layoutGroup).getByRole("radio", { name: "地图优先" }),
    ).not.toBeChecked();
    expect(
      within(advancedDialog).queryByLabelText("端口"),
    ).not.toBeInTheDocument();
    expect(
      within(advancedDialog).queryByLabelText("Packets"),
    ).not.toBeInTheDocument();
    expect(
      within(advancedDialog).queryByLabelText("包数"),
    ).not.toBeInTheDocument();
    expect(
      within(advancedDialog).getByLabelText("Globalping Token"),
    ).toBeVisible();
    expect(
      within(advancedDialog).getByText("未使用 Globalping Token"),
    ).toBeVisible();
    expect(
      within(advancedDialog)
        .getByRole("button", { name: "保存 Globalping" })
        .closest(".token-action-surface[data-liquid-glass]"),
    ).not.toBeNull();
    expect(
      within(advancedDialog)
        .getByRole("button", { name: "清除 Globalping" })
        .closest(".token-action-surface[data-liquid-glass]"),
    ).not.toBeNull();
    expect(
      within(advancedDialog)
        .getByRole("button", { name: "保存 NextTrace" })
        .closest(".token-action-surface[data-liquid-glass]"),
    ).not.toBeNull();
    expect(
      within(advancedDialog)
        .getByRole("button", { name: "清除 NextTrace" })
        .closest(".token-action-surface[data-liquid-glass]"),
    ).not.toBeNull();
    expect(
      within(advancedDialog).getByRole("link", {
        name: "获取 NextTrace API Token",
      }),
    ).toHaveAttribute("href", "https://api.nxtrace.org/v4/api-tokens");
    expect(
      within(advancedDialog)
        .getByRole("link", { name: "获取 NextTrace API Token" })
        .closest(".token-help-surface[data-liquid-glass]"),
    ).not.toBeNull();
    expect(
      within(advancedDialog).getByLabelText("NextTrace API Token"),
    ).toBeVisible();
    expect(
      within(advancedDialog).getByText("未使用 NextTrace Token"),
    ).toBeVisible();
    expect(
      within(advancedDialog).getByRole("link", {
        name: "获取 NextTrace API Token",
      }),
    ).toHaveAttribute("href", "https://api.nxtrace.org/v4/api-tokens");
    fireEvent.change(screen.getByLabelText("magic string"), {
      target: { value: "DE+Hetzner" },
    });
    expect(onFiltersChange).toHaveBeenCalledWith({ magic: "DE+Hetzner" });
  });

  it("controls liquid glass intensity from the advanced dialog", () => {
    const onLiquidGlassIntensityChange = vi.fn();
    const { unmount } = renderPanel({
      liquidGlassEnabled: true,
      liquidGlassIntensity: 82,
      onLiquidGlassIntensityChange,
    });

    openAdvancedParams();
    const slider = screen.getByLabelText("液态玻璃强度") as HTMLInputElement;
    expect(slider).toHaveValue("82");
    expect(slider).not.toBeDisabled();
    fireEvent.change(slider, { target: { value: "91" } });
    expect(onLiquidGlassIntensityChange).toHaveBeenCalledWith(91);

    unmount();
    renderPanel({
      liquidGlassEnabled: false,
      liquidGlassIntensity: 42,
      onLiquidGlassIntensityChange,
    });
    openAdvancedParams();
    const disabledSlider = screen.getByLabelText(
      "液态玻璃强度",
    ) as HTMLInputElement;
    expect(disabledSlider).toHaveValue("42");
    expect(disabledSlider).toBeDisabled();
  });

  it("updates result layout from the advanced dialog", () => {
    const onResultContentOrderChange = vi.fn();
    renderPanel({
      resultContentOrder: "table-first",
      onResultContentOrderChange,
    });

    openAdvancedParams();
    fireEvent.click(screen.getByRole("radio", { name: "地图优先" }));

    expect(onResultContentOrderChange).toHaveBeenCalledWith("map-first");
  });

  it("updates network type filters and protocol controls", () => {
    const onFiltersChange = vi.fn();
    const onProtocolChange = vi.fn();
    renderPanel({ onFiltersChange, onProtocolChange });

    fireEvent.click(screen.getByRole("button", { name: "TCP" }));
    openExactFilters();
    fireEvent.click(screen.getByLabelText("eyeball"));

    expect(onProtocolChange).toHaveBeenCalledWith("TCP");
    expect(onFiltersChange).toHaveBeenCalledWith({
      magic: undefined,
      eyeball: true,
    });
  });

  it("defaults exact filters open on desktop and collapsed on mobile", () => {
    mockExactFiltersViewport(true);
    const desktop = renderPanel();

    expect(exactFiltersPanel().open).toBe(true);
    expect(screen.getByLabelText("国家/地区")).toBeVisible();

    desktop.unmount();
    mockExactFiltersViewport(false);
    renderPanel();

    expect(exactFiltersPanel().open).toBe(false);
    expect(screen.getByLabelText("国家/地区")).not.toBeVisible();
  });

  it("syncs exact filters with the breakpoint until the user toggles them", () => {
    const viewport = mockExactFiltersViewport(false);
    renderPanel();

    expect(exactFiltersPanel().open).toBe(false);
    act(() => viewport.setMatches(true));
    expect(exactFiltersPanel().open).toBe(true);

    fireEvent.click(screen.getByText("精确筛选"));
    expect(exactFiltersPanel().open).toBe(false);
    act(() => viewport.setMatches(false));
    act(() => viewport.setMatches(true));
    expect(exactFiltersPanel().open).toBe(false);
  });

  it("keeps run controls in the footer when the magic summary is long", () => {
    const magic = Array.from(
      { length: 12 },
      (_, index) =>
        `Novosibirsk-${index}+RU+AS${21000 + index}+datacenter-network`,
    ).join(", ");
    renderPanel({
      filters: { magic },
      chips: filterChips({ magic }),
      selectionNotice: "框选 12 个 probes，已按上限取前 10 个",
    });

    const chips = screen.getByTestId("filter-chips");
    expect(chips).toHaveTextContent(
      "Novosibirsk-0+RU+AS21000+datacenter-network",
    );
    expect(within(chips).queryByText("magic")).not.toBeInTheDocument();
    const magicSummary = within(chips).getByText(magic);
    expect(magicSummary.closest(".filter-chip")).toBeNull();
    expect(magicSummary.closest(".filter-magic-summary")).not.toBeNull();
    expect(screen.getByText("当前筛选")).toBeInTheDocument();
    const footer = screen.getByTestId("filter-panel-footer");
    expect(
      within(footer).queryByRole("button", { name: "开始网络路径诊断" }),
    ).not.toBeInTheDocument();
  });

  it("updates IP version button", () => {
    const onIpVersionChange = vi.fn();
    const first = renderPanel({ ipVersion: 4, onIpVersionChange });

    expect(screen.queryByLabelText("IP 版本")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "IPv4" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "IPv4" }));
    first.unmount();
    renderPanel({ ipVersion: 6, onIpVersionChange });
    expect(screen.getByRole("button", { name: "IPv6" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "IPv6" }));

    expect(onIpVersionChange).toHaveBeenNthCalledWith(1, 6);
    expect(onIpVersionChange).toHaveBeenNthCalledWith(2, 4);
  });

  it("shows the example placeholder instead of default world magic", () => {
    renderPanel();

    const magicInput = screen.getByLabelText("magic string");
    expect(magicInput).toHaveValue("");
    expect(magicInput).toHaveAttribute(
      "placeholder",
      "Shanghai+China Telecom, US+AS7922, Yokohama+JP+AS17676+SoftBank",
    );
    fireEvent.focus(magicInput);
    expect(
      screen.queryByRole("listbox", { name: "候选列表" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("filter-chips")).toHaveTextContent("world");
  });

  it("shows magic string suggestions and selects them with the keyboard", () => {
    const onFiltersChange = vi.fn();
    renderPanel({
      filters: { magic: "AS" },
      chips: filterChips({ magic: "AS" }),
      filterSuggestions: {
        countries: [],
        cities: [],
        asns: [],
        networks: [],
        tags: [],
        magicStrings: MAGIC_SUGGESTIONS,
      },
      onFiltersChange,
    });

    const magicInput = screen.getByLabelText("magic string");
    fireEvent.focus(magicInput);
    expectSuggestionOptions(MAGIC_SUGGESTIONS);

    fireEvent.keyDown(magicInput, { key: "ArrowDown" });
    fireEvent.keyDown(magicInput, { key: "Enter" });

    expect(onFiltersChange).toHaveBeenCalledWith({
      magic: "Falkenstein+DE+AS24940+datacenter-network",
    });
  });

  it("hides magic suggestions while the current comma-separated segment is empty", () => {
    renderPanel({
      filters: { magic: "US, " },
      chips: filterChips({ magic: "US, " }),
      filterSuggestions: {
        countries: [],
        cities: [],
        asns: [],
        networks: [],
        tags: [],
        magicStrings: MAGIC_SUGGESTIONS,
      },
    });

    const magicInput = screen.getByLabelText(
      "magic string",
    ) as HTMLTextAreaElement;
    magicInput.setSelectionRange(
      magicInput.value.length,
      magicInput.value.length,
    );
    fireEvent.focus(magicInput);

    expect(
      screen.queryByRole("listbox", { name: "候选列表" }),
    ).not.toBeInTheDocument();
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
        tags: [],
        magicStrings: MAGIC_SUGGESTIONS,
      },
      onFiltersChange,
    });

    const magicInput = screen.getByLabelText(
      "magic string",
    ) as HTMLTextAreaElement;
    magicInput.setSelectionRange(
      magicInput.value.length,
      magicInput.value.length,
    );
    fireEvent.focus(magicInput);

    expectSuggestionOptions(["Falkenstein+DE+AS24940+datacenter-network"]);

    fireEvent.mouseDown(
      screen.getByRole("option", {
        name: "Falkenstein+DE+AS24940+datacenter-network",
      }),
    );

    expect(onFiltersChange).toHaveBeenCalledWith({
      magic: "US, Falkenstein+DE+AS24940+datacenter-network",
    });
  });

  it("shows generic magic suggestions before matching full probe suggestions", () => {
    renderPanel({
      filters: { magic: "CN+Sha" },
      chips: filterChips({ magic: "CN+Sha" }),
      filterSuggestions: {
        countries: [],
        cities: [],
        asns: [],
        networks: [],
        tags: ["eyeball-network"],
        magicStrings: CHINA_MAGIC_SUGGESTIONS,
      },
    });

    const magicInput = screen.getByLabelText(
      "magic string",
    ) as HTMLTextAreaElement;
    magicInput.setSelectionRange(
      magicInput.value.length,
      magicInput.value.length,
    );
    fireEvent.focus(magicInput);

    expectSuggestionOptions([
      "CN+Shanghai",
      "Shanghai+CN+AS4134+eyeball-network",
    ]);
  });

  it("matches generic magic suggestions regardless of token order", () => {
    renderPanel({
      filters: { magic: "AS4134+CN" },
      chips: filterChips({ magic: "AS4134+CN" }),
      filterSuggestions: {
        countries: [],
        cities: [],
        asns: [],
        networks: [],
        tags: ["eyeball-network"],
        magicStrings: CHINA_MAGIC_SUGGESTIONS,
      },
    });

    const magicInput = screen.getByLabelText(
      "magic string",
    ) as HTMLTextAreaElement;
    magicInput.setSelectionRange(
      magicInput.value.length,
      magicInput.value.length,
    );
    fireEvent.focus(magicInput);

    expectSuggestionOptions([
      "CN+AS4134",
      "Shanghai+CN+AS4134+eyeball-network",
    ]);
  });

  it("matches network magic suggestions regardless of token order", () => {
    const first = renderPanel({
      filters: { magic: "US+Com" },
      chips: filterChips({ magic: "US+Com" }),
      filterSuggestions: {
        countries: [],
        cities: [],
        asns: [],
        networks: ["Comcast"],
        tags: ["eyeball-network"],
        magicStrings: NETWORK_MAGIC_SUGGESTIONS,
      },
    });

    const magicInput = screen.getByLabelText(
      "magic string",
    ) as HTMLTextAreaElement;
    magicInput.setSelectionRange(
      magicInput.value.length,
      magicInput.value.length,
    );
    fireEvent.focus(magicInput);

    expectSuggestionOptions([
      "US+Comcast",
      "US+AS7922+Comcast",
      "Los Angeles+US+Comcast",
      "Los Angeles+US+AS7922+Comcast",
    ]);

    first.unmount();
    renderPanel({
      filters: { magic: "AS7922+US+Com" },
      chips: filterChips({ magic: "AS7922+US+Com" }),
      filterSuggestions: {
        countries: [],
        cities: [],
        asns: [],
        networks: ["Comcast"],
        tags: ["eyeball-network"],
        magicStrings: NETWORK_MAGIC_SUGGESTIONS,
      },
    });

    const updatedMagicInput = screen.getByLabelText(
      "magic string",
    ) as HTMLTextAreaElement;
    updatedMagicInput.setSelectionRange(
      updatedMagicInput.value.length,
      updatedMagicInput.value.length,
    );
    fireEvent.focus(updatedMagicInput);
    expectSuggestionOptions([
      "US+AS7922+Comcast",
      "Los Angeles+US+AS7922+Comcast",
    ]);
  });

  it("matches network and city magic suggestions with partial network tokens", () => {
    const first = renderPanel({
      filters: { magic: "China Telecom+Sh" },
      chips: filterChips({ magic: "China Telecom+Sh" }),
      filterSuggestions: {
        countries: [],
        cities: [],
        asns: [],
        networks: ["China Telecom"],
        tags: ["eyeball-network"],
        magicStrings: CHINA_NETWORK_MAGIC_SUGGESTIONS,
      },
    });

    const magicInput = screen.getByLabelText(
      "magic string",
    ) as HTMLTextAreaElement;
    magicInput.setSelectionRange(
      magicInput.value.length,
      magicInput.value.length,
    );
    fireEvent.focus(magicInput);

    expectSuggestionOptions([
      "Shanghai+CN+China Telecom",
      "Shanghai+CN+AS4134+China Telecom",
    ]);

    first.unmount();
    renderPanel({
      filters: { magic: "AS4134+China Tele" },
      chips: filterChips({ magic: "AS4134+China Tele" }),
      filterSuggestions: {
        countries: [],
        cities: [],
        asns: [],
        networks: ["China Telecom"],
        tags: ["eyeball-network"],
        magicStrings: CHINA_NETWORK_MAGIC_SUGGESTIONS,
      },
    });

    const updatedMagicInput = screen.getByLabelText(
      "magic string",
    ) as HTMLTextAreaElement;
    updatedMagicInput.setSelectionRange(
      updatedMagicInput.value.length,
      updatedMagicInput.value.length,
    );
    fireEvent.focus(updatedMagicInput);
    expectSuggestionOptions([
      "CN+AS4134+China Telecom",
      "Shanghai+CN+AS4134+China Telecom",
    ]);
  });

  it("clears magic when structured filters are edited", () => {
    const onFiltersChange = vi.fn();
    renderPanel({
      filters: { magic: "DE+AS24940" },
      chips: filterChips({ magic: "DE+AS24940" }),
      onFiltersChange,
    });

    openExactFilters();
    fireEvent.change(screen.getByLabelText("国家/地区"), {
      target: { value: "US" },
    });
    fireEvent.change(screen.getByLabelText("ASN"), {
      target: { value: "7922" },
    });
    fireEvent.change(screen.getByLabelText("network"), {
      target: { value: "Comcast" },
    });

    expect(onFiltersChange).toHaveBeenNthCalledWith(1, {
      magic: undefined,
      country: "US",
    });
    expect(onFiltersChange).toHaveBeenNthCalledWith(2, {
      magic: undefined,
      asn: "7922",
    });
    expect(onFiltersChange).toHaveBeenNthCalledWith(3, {
      magic: undefined,
      network: "Comcast",
    });
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
        tags: ["datacenter-network", "eyeball-network"],
        magicStrings: MAGIC_SUGGESTIONS,
      },
      onFiltersChange,
    });

    openExactFilters();

    expect(document.querySelector("datalist")).toBeNull();

    const countryInput = screen.getByLabelText("国家/地区");
    fireEvent.focus(countryInput);
    expectSuggestionOptions(["DE", "US"]);
    fireEvent.blur(countryInput);

    const networkInput = screen.getByLabelText("network");
    fireEvent.focus(networkInput);
    fireEvent.mouseDown(screen.getByRole("option", { name: "Hetzner Online" }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      magic: undefined,
      network: "Hetzner Online",
    });

    const asnInput = screen.getByLabelText("ASN");
    fireEvent.focus(asnInput);
    fireEvent.keyDown(asnInput, { key: "ArrowDown" });
    fireEvent.keyDown(asnInput, { key: "Enter" });
    expect(onFiltersChange).toHaveBeenCalledWith({
      magic: undefined,
      asn: "AS24940",
    });
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
        tags: ["datacenter-network", "eyeball-network"],
        magicStrings: MAGIC_SUGGESTIONS,
      },
      onFiltersChange,
    });

    openExactFilters();
    const networkInput = screen.getByLabelText("network");
    fireEvent.focus(networkInput);

    expectSuggestionOptions(["Comcast"]);

    fireEvent.change(networkInput, { target: { value: "custom network" } });
    expect(onFiltersChange).toHaveBeenCalledWith({
      magic: undefined,
      network: "custom network",
    });
  });

  it("filters and selects tag suggestions without blocking free text", () => {
    const onFiltersChange = vi.fn();
    renderPanel({
      filters: { tag: "eye" },
      chips: filterChips({ tag: "eye" }),
      filterSuggestions: {
        countries: [],
        cities: [],
        asns: [],
        networks: [],
        tags: ["datacenter-network", "eyeball-network"],
        magicStrings: MAGIC_SUGGESTIONS,
      },
      onFiltersChange,
    });

    openExactFilters();
    const tagInput = screen.getByLabelText("tag");
    fireEvent.focus(tagInput);

    expectSuggestionOptions(["eyeball-network"]);

    fireEvent.mouseDown(
      screen.getByRole("option", { name: "eyeball-network" }),
    );
    expect(onFiltersChange).toHaveBeenCalledWith({
      magic: undefined,
      tag: "eyeball-network",
    });

    fireEvent.change(tagInput, { target: { value: "custom-tag" } });
    expect(onFiltersChange).toHaveBeenCalledWith({
      magic: undefined,
      tag: "custom-tag",
    });
  });

  it("preserves spaces while editing network filters", () => {
    const onFiltersChange = vi.fn();
    renderPanel({ filters: {}, chips: filterChips({}), onFiltersChange });

    openExactFilters();
    fireEvent.change(screen.getByLabelText("network"), {
      target: { value: "Hetzner Online " },
    });
    fireEvent.change(screen.getByLabelText("network"), {
      target: { value: "   " },
    });

    expect(onFiltersChange).toHaveBeenNthCalledWith(1, {
      magic: undefined,
      network: "Hetzner Online ",
    });
    expect(onFiltersChange).toHaveBeenNthCalledWith(2, {
      magic: undefined,
      network: undefined,
    });
  });

  it("disables the run action and shows loading/error statuses", () => {
    renderPanel({
      loading: true,
      probesStatus: "error",
    });

    expect(
      screen.getByRole("button", { name: "开始网络路径诊断" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen
        .getByRole("button", { name: "开始网络路径诊断" })
        .closest("[data-liquid-glass]"),
    ).not.toHaveAttribute("data-liquid-glass-interactive");
    expect(screen.getByText("probes 读取失败")).toBeInTheDocument();
  });

  it("keeps the run action available when config is ready", () => {
    const first = renderPanel({ canSubmit: true });

    expect(
      screen.getByRole("button", { name: "开始网络路径诊断" }),
    ).not.toHaveAttribute("aria-disabled");

    first.unmount();
    renderPanel({ canSubmit: false });

    expect(
      screen.getByRole("button", { name: "开始网络路径诊断" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("warns when the probe limit is above the default and can reduce it", () => {
    const onLimitChange = vi.fn();
    const first = renderPanel({ limit: 4, onLimitChange });

    expect(
      screen.getByText("Probe 越多，结果获取通常越慢。"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "降到 3" }));
    expect(onLimitChange).toHaveBeenCalledWith(3);

    first.unmount();
    renderPanel({ limit: 3 });

    expect(
      screen.queryByText("Probe 越多，结果获取通常越慢。"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "降到 3" }),
    ).not.toBeInTheDocument();
  });

  it("updates token controls, theme, and about actions", () => {
    const onGlobalpingTokenDraftChange = vi.fn();
    const onSaveGlobalpingToken = vi.fn();
    const onClearGlobalpingToken = vi.fn();
    const onGlobalpingTokenRememberedChange = vi.fn();
    const onNexttraceTokenDraftChange = vi.fn();
    const onSaveNexttraceToken = vi.fn();
    const onClearNexttraceToken = vi.fn();
    const onNexttraceTokenRememberedChange = vi.fn();
    const onCycleThemeMode = vi.fn();
    const onLiquidGlassEnabledChange = vi.fn();
    const onLiquidGlassIntensityChange = vi.fn();
    const onNavigateAbout = vi.fn();
    renderPanel({
      globalpingTokenDraft: "gp-token",
      globalpingTokenSaved: true,
      globalpingTokenRemembered: true,
      nexttraceTokenDraft: "nt-token",
      nexttraceTokenSaved: true,
      nexttraceTokenRemembered: true,
      themeMode: "dark",
      liquidGlassEnabled: false,
      liquidGlassIntensity: 70,
      onGlobalpingTokenDraftChange,
      onSaveGlobalpingToken,
      onClearGlobalpingToken,
      onGlobalpingTokenRememberedChange,
      onNexttraceTokenDraftChange,
      onSaveNexttraceToken,
      onClearNexttraceToken,
      onNexttraceTokenRememberedChange,
      onCycleThemeMode,
      onLiquidGlassEnabledChange,
      onLiquidGlassIntensityChange,
      onNavigateAbout,
    });

    openAdvancedParams();
    fireEvent.change(screen.getByLabelText("Globalping Token"), {
      target: { value: "next-token" },
    });
    fireEvent.change(screen.getByLabelText("NextTrace API Token"), {
      target: { value: "nexttrace-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存 Globalping" }));
    fireEvent.click(screen.getByRole("button", { name: "清除 Globalping" }));
    fireEvent.click(screen.getByLabelText("记住 Globalping 到本机"));
    fireEvent.click(screen.getByRole("button", { name: "保存 NextTrace" }));
    fireEvent.click(screen.getByRole("button", { name: "清除 NextTrace" }));
    fireEvent.click(screen.getByLabelText("记住 NextTrace 到本机"));
    fireEvent.click(screen.getByLabelText("液态玻璃效果"));
    fireEvent.click(screen.getByRole("button", { name: "主题：Dark" }));
    fireEvent.click(screen.getByRole("link", { name: "关于 GlobalTrace" }));

    expect(
      screen.getByText("Globalping Token 已记住到本机浏览器"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("NextTrace Token 已记住到本机浏览器"),
    ).toBeInTheDocument();
    expect(onGlobalpingTokenDraftChange).toHaveBeenCalledWith("next-token");
    expect(onNexttraceTokenDraftChange).toHaveBeenCalledWith("nexttrace-token");
    expect(onSaveGlobalpingToken).toHaveBeenCalledTimes(1);
    expect(onClearGlobalpingToken).toHaveBeenCalledTimes(1);
    expect(onGlobalpingTokenRememberedChange).toHaveBeenCalledWith(false);
    expect(onSaveNexttraceToken).toHaveBeenCalledTimes(1);
    expect(onClearNexttraceToken).toHaveBeenCalledTimes(1);
    expect(onNexttraceTokenRememberedChange).toHaveBeenCalledWith(false);
    expect(onLiquidGlassEnabledChange).toHaveBeenCalledWith(true);
    expect(onCycleThemeMode).toHaveBeenCalledTimes(1);
    expect(onNavigateAbout).toHaveBeenCalledTimes(1);
  });

  it("navigates home from the brand link", () => {
    const onNavigateHome = vi.fn();
    renderPanel({ onNavigateHome });

    const homeLink = screen.getByRole("link", { name: "返回首页" });
    expect(homeLink).toHaveAttribute("href", "/");
    fireEvent.click(homeLink);

    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });

  it("uses a semantic about link", () => {
    const onNavigateAbout = vi.fn();
    renderPanel({ onNavigateAbout });

    const aboutLink = screen.getByRole("link", { name: "关于 GlobalTrace" });
    expect(aboutLink).toHaveAttribute("href", "/about");
    fireEvent.click(aboutLink);

    expect(onNavigateAbout).toHaveBeenCalledTimes(1);
  });
});

function renderPanel(
  overrides: Partial<ComponentProps<typeof FilterPanel>> = {},
) {
  const filters: TraceFilters = { magic: "world" };
  return render(
    <FilterPanel
      target="globalping.io"
      protocol="ICMP"
      ipVersion={4}
      port=""
      packets={5}
      limit={3}
      filters={filters}
      chips={filterChips(filters)}
      visibleProbes={12}
      totalProbes={120}
      probesStatus="ready"
      selectionNotice=""
      loading={false}
      canSubmit={true}
      globalpingTokenDraft=""
      globalpingTokenSaved={false}
      globalpingTokenRemembered={false}
      nexttraceTokenDraft=""
      nexttraceTokenSaved={false}
      nexttraceTokenRemembered={false}
      themeMode="system"
      liquidGlassEnabled={true}
      liquidGlassIntensity={70}
      resultContentOrder="table-first"
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
      onGlobalpingTokenRememberedChange={vi.fn()}
      onNexttraceTokenDraftChange={vi.fn()}
      onSaveNexttraceToken={vi.fn()}
      onClearNexttraceToken={vi.fn()}
      onNexttraceTokenRememberedChange={vi.fn()}
      onCycleThemeMode={vi.fn()}
      onLiquidGlassEnabledChange={vi.fn()}
      onLiquidGlassIntensityChange={vi.fn()}
      onResultContentOrderChange={vi.fn()}
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
  expect(
    within(listbox)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(values);
}

function mockExactFiltersViewport(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(min-width: 821px)",
    onchange: null,
    addEventListener: vi.fn(
      (type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (type === "change") listeners.add(listener);
      },
    ),
    removeEventListener: vi.fn(
      (type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (type === "change") listeners.delete(listener);
      },
    ),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    ),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
    ),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mediaQueryList),
  );
  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = {
        matches,
        media: "(min-width: 821px)",
      } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}
