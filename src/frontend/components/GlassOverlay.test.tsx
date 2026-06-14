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
});
