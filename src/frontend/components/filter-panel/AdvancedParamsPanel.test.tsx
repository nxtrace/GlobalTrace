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

  it("updates liquid glass settings and disables intensity when off", () => {
    const onLiquidGlassEnabledChange = vi.fn();
    const onLiquidGlassIntensityChange = vi.fn();
    const { rerender } = render(
      <AdvancedParamsPanel
        {...defaultProps({
          liquidGlassEnabled: true,
          liquidGlassIntensity: 72,
          onLiquidGlassEnabledChange,
          onLiquidGlassIntensityChange,
        })}
      />,
    );

    const intensity = screen.getByLabelText("液态玻璃强度");
    expect(intensity).toHaveValue("72");
    expect(intensity).not.toBeDisabled();

    fireEvent.click(screen.getByRole("switch", { name: "液态玻璃效果" }));
    fireEvent.change(intensity, { target: { value: "35" } });

    expect(onLiquidGlassEnabledChange).toHaveBeenCalledWith(false);
    expect(onLiquidGlassIntensityChange).toHaveBeenCalledWith(35);

    rerender(<AdvancedParamsPanel {...defaultProps({ liquidGlassEnabled: false })} />);
    expect(screen.getByLabelText("液态玻璃强度")).toBeDisabled();
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

    const layoutGroup = screen.getByRole("radiogroup", { name: "结果页面显示顺序" });
    expect(within(layoutGroup).getByRole("radio", { name: "地图优先" })).toBeChecked();
    expect(within(layoutGroup).getByRole("radio", { name: "表格优先" })).not.toBeChecked();

    fireEvent.click(within(layoutGroup).getByRole("radio", { name: "表格优先" }));

    expect(onResultContentOrderChange).toHaveBeenCalledWith("table-first");
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
    liquidGlassEnabled: true,
    liquidGlassIntensity: 50,
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
    onLiquidGlassEnabledChange: vi.fn(),
    onLiquidGlassIntensityChange: vi.fn(),
    onResultContentOrderChange: vi.fn(),
    onNavigateHome: vi.fn(),
    onNavigateAbout: vi.fn(),
    onReset: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
}
