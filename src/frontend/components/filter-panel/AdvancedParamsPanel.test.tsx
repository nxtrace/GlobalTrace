import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FilterPanelProps } from "../FilterPanel";
import { AdvancedParamsPanel } from "./AdvancedParamsPanel";

describe("AdvancedParamsPanel", () => {
  it("renders token status and calls token actions", () => {
    const onSaveGlobalpingToken = vi.fn();
    const onClearGlobalpingToken = vi.fn();
    const onSaveNexttraceToken = vi.fn();
    const onClearNexttraceToken = vi.fn();

    render(
      <AdvancedParamsPanel
        {...defaultProps({
          globalpingTokenDraft: "gp-token",
          globalpingTokenSaved: true,
          globalpingTokenRemembered: true,
          nexttraceTokenDraft: "nt-token",
          nexttraceTokenSaved: true,
          nexttraceTokenRemembered: false,
          onSaveGlobalpingToken,
          onClearGlobalpingToken,
          onSaveNexttraceToken,
          onClearNexttraceToken,
        })}
      />,
    );

    expect(screen.getByText("Globalping Token 已记住到本机浏览器")).toBeInTheDocument();
    expect(screen.getByText("NextTrace Token 仅当前会话可用")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "获取 NextTrace API Token" })).toHaveAttribute(
      "href",
      "https://api.nxtrace.org/v4/api-tokens",
    );
    expect(screen.getByRole("link", { name: "获取 NextTrace API Token" })).toHaveTextContent("获取 Token");

    fireEvent.click(screen.getByRole("button", { name: "保存 Globalping" }));
    fireEvent.click(screen.getByRole("button", { name: "清除 Globalping" }));
    fireEvent.click(screen.getByRole("button", { name: "保存 NextTrace" }));
    fireEvent.click(screen.getByRole("button", { name: "清除 NextTrace" }));

    expect(onSaveGlobalpingToken).toHaveBeenCalledTimes(1);
    expect(onClearGlobalpingToken).toHaveBeenCalledTimes(1);
    expect(onSaveNexttraceToken).toHaveBeenCalledTimes(1);
    expect(onClearNexttraceToken).toHaveBeenCalledTimes(1);
  });

  it("updates token drafts and remember switches", () => {
    const onGlobalpingTokenDraftChange = vi.fn();
    const onNexttraceTokenDraftChange = vi.fn();
    const onGlobalpingTokenRememberedChange = vi.fn();
    const onNexttraceTokenRememberedChange = vi.fn();

    render(
      <AdvancedParamsPanel
        {...defaultProps({
          onGlobalpingTokenDraftChange,
          onNexttraceTokenDraftChange,
          onGlobalpingTokenRememberedChange,
          onNexttraceTokenRememberedChange,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Globalping Token"), { target: { value: "gp" } });
    fireEvent.change(screen.getByLabelText("NextTrace API Token"), { target: { value: "nt" } });
    fireEvent.click(screen.getByRole("switch", { name: "记住 Globalping 到本机" }));
    fireEvent.click(screen.getByRole("switch", { name: "记住 NextTrace 到本机" }));

    expect(onGlobalpingTokenDraftChange).toHaveBeenCalledWith("gp");
    expect(onNexttraceTokenDraftChange).toHaveBeenCalledWith("nt");
    expect(onGlobalpingTokenRememberedChange).toHaveBeenCalledWith(true);
    expect(onNexttraceTokenRememberedChange).toHaveBeenCalledWith(true);
  });

  it("updates result content order from the radiogroup", () => {
    const onResultContentOrderChange = vi.fn();

    render(
      <AdvancedParamsPanel
        {...defaultProps({
          resultContentOrder: "map-first",
          onResultContentOrderChange,
        })}
      />,
    );

    const layoutGroup = screen.getByRole("radiogroup", { name: "显示模式 · 仅桌面端有效" });
    expect(within(layoutGroup).getByRole("radio", { name: "地图优先" })).toBeChecked();
    expect(within(layoutGroup).getByRole("radio", { name: "表格优先" })).not.toBeChecked();

    fireEvent.click(within(layoutGroup).getByRole("radio", { name: "表格优先" }));

    expect(onResultContentOrderChange).toHaveBeenCalledWith("table-first");
  });

  it.each([
    ["map-first", "ArrowLeft", "table-first"],
    ["map-first", "ArrowUp", "table-first"],
    ["table-first", "ArrowRight", "map-first"],
    ["table-first", "ArrowDown", "map-first"],
  ] as const)("moves and selects from %s with %s", (current, key, expected) => {
    const onResultContentOrderChange = vi.fn();
    render(
      <AdvancedParamsPanel
        {...defaultProps({
          resultContentOrder: current,
          onResultContentOrderChange,
        })}
      />,
    );

    const currentOption = screen.getByRole("radio", {
      name: current === "map-first" ? "地图优先" : "表格优先",
    });
    const expectedOption = screen.getByRole("radio", {
      name: expected === "map-first" ? "地图优先" : "表格优先",
    });
    expect(currentOption).toHaveAttribute("tabindex", "0");
    expect(expectedOption).toHaveAttribute("tabindex", "-1");

    currentOption.focus();
    fireEvent.keyDown(currentOption, { key });

    expect(onResultContentOrderChange).toHaveBeenCalledWith(expected);
    expect(expectedOption).toHaveFocus();
  });
});

function defaultProps(overrides: Partial<FilterPanelProps> = {}): FilterPanelProps {
  return {
    target: "example.com",
    protocol: "ICMP",
    ipVersion: 4,
    port: "",
    packets: 5,
    limit: 3,
    filters: {},
    chips: [],
    visibleProbes: 0,
    totalProbes: 0,
    probesStatus: "ready",
    quota: {
      status: "ready",
      remaining: 245,
      limit: 250,
      actor: "当前 IP",
      modeLabel: "Globalping credits 控制诊断创建",
    },
    selectionNotice: "",
    loading: false,
    canSubmit: true,
    globalpingTokenDraft: "",
    globalpingTokenSaved: false,
    globalpingTokenRemembered: false,
    nexttraceTokenDraft: "",
    nexttraceTokenSaved: false,
    nexttraceTokenRemembered: false,
    themeMode: "system",
    resultContentOrder: "map-first",
    onTargetChange: vi.fn(),
    onProtocolChange: vi.fn(),
    onIpVersionChange: vi.fn(),
    onPortChange: vi.fn(),
    onPacketsChange: vi.fn(),
    onLimitChange: vi.fn(),
    onFiltersChange: vi.fn(),
    onGlobalpingTokenDraftChange: vi.fn(),
    onSaveGlobalpingToken: vi.fn(),
    onClearGlobalpingToken: vi.fn(),
    onGlobalpingTokenRememberedChange: vi.fn(),
    onNexttraceTokenDraftChange: vi.fn(),
    onSaveNexttraceToken: vi.fn(),
    onClearNexttraceToken: vi.fn(),
    onNexttraceTokenRememberedChange: vi.fn(),
    onCycleThemeMode: vi.fn(),
    onResultContentOrderChange: vi.fn(),
    onNavigateHome: vi.fn(),
    onNavigateAbout: vi.fn(),
    onReset: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
}
