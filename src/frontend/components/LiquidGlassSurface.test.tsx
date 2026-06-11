import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiquidGlassSurface } from "./LiquidGlassSurface";

vi.mock("liquid-glass-react", () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="liquid-glass-mock">{children}</div>,
}));

beforeEach(() => {
  vi.stubGlobal("CSS", { supports: vi.fn(() => true) });
  vi.stubGlobal(
    "requestIdleCallback",
    vi.fn((idleCallback: IdleRequestCallback) =>
      window.setTimeout(() => idleCallback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline), 0),
    ),
  );
  vi.stubGlobal("cancelIdleCallback", vi.fn((id: number) => window.clearTimeout(id)));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("liquid-glass-force-fallback");
  window.history.replaceState(null, "", "/");
});

describe("LiquidGlassSurface", () => {
  it("renders fallback first and loads liquid glass after idle", async () => {
    render(
      <LiquidGlassSurface>
        <span>Glass content</span>
      </LiquidGlassSurface>,
    );
    const surface = screen.getByText("Glass content").closest("[data-liquid-glass]");

    expect(surface).toHaveAttribute("data-liquid-glass-mode", "fallback");

    await waitFor(() => expect(surface).toHaveAttribute("data-liquid-glass-mode", "liquid"));
    expect(screen.getByTestId("liquid-glass-mock")).toBeInTheDocument();
  });

  it("keeps the explicit fallback mode without loading liquid glass", async () => {
    window.history.replaceState(null, "", "/?forceGlassFallback=1");

    render(
      <LiquidGlassSurface>
        <span>Fallback content</span>
      </LiquidGlassSurface>,
    );
    const surface = screen.getByText("Fallback content").closest("[data-liquid-glass]");

    expect(surface).toHaveAttribute("data-liquid-glass-mode", "fallback");
    expect(document.documentElement).toHaveClass("liquid-glass-force-fallback");
    expect(screen.queryByTestId("liquid-glass-mock")).not.toBeInTheDocument();
  });
});
