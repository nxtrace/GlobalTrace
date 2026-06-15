import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GlassOverlay } from "./GlassOverlay";
import { LiquidGlassPreferenceProvider } from "./LiquidGlassSurface";

describe("GlassOverlay", () => {
  it("wraps the close button in a liquid surface and preserves close interactions", () => {
    const onClose = vi.fn();

    render(
      <LiquidGlassPreferenceProvider enabled={false} intensity={70}>
        <GlassOverlay open title="高级参数" onClose={onClose}>
          <p>content</p>
        </GlassOverlay>
      </LiquidGlassPreferenceProvider>,
    );

    const dialog = screen.getByRole("dialog", { name: "高级参数" });
    expect(dialog).toBeVisible();
    const closeButton = screen.getByRole("button", { name: "关闭高级参数" });
    expect(closeButton.closest(".overlay-close-surface[data-liquid-glass]")).toHaveClass("liquid-glass-iconButton");

    fireEvent.click(closeButton);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(document.querySelector(".glass-overlay") as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("keeps keyboard focus inside the dialog and restores previous focus", () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    opener.textContent = "open";
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(
      <LiquidGlassPreferenceProvider enabled={false} intensity={70}>
        <GlassOverlay open title="高级参数" onClose={onClose}>
          <button type="button">确认</button>
        </GlassOverlay>
      </LiquidGlassPreferenceProvider>,
    );

    const closeButton = screen.getByRole("button", { name: "关闭高级参数" });
    const confirmButton = screen.getByRole("button", { name: "确认" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(confirmButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    rerender(
      <LiquidGlassPreferenceProvider enabled={false} intensity={70}>
        <GlassOverlay open={false} title="高级参数" onClose={onClose}>
          <button type="button">确认</button>
        </GlassOverlay>
      </LiquidGlassPreferenceProvider>,
    );
    expect(opener).toHaveFocus();

    opener.remove();
  });
});
