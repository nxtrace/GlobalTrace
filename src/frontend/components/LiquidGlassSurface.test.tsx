import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiquidGlassSurface } from "./LiquidGlassSurface";

vi.mock("liquid-glass-react", () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="liquid-glass-mock">{children}</div>,
}));

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
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
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage?.clear();
  document.documentElement.classList.remove("liquid-glass-force-fallback");
  window.history.replaceState(null, "", "/");
});

describe("LiquidGlassSurface", () => {
  it("renders fallback first and loads liquid glass after window load and idle", async () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");

    render(
      <LiquidGlassSurface>
        <span>Glass content</span>
      </LiquidGlassSurface>,
    );
    const surface = screen.getByText("Glass content").closest("[data-liquid-glass]");

    expect(surface).toHaveAttribute("data-liquid-glass-mode", "fallback");
    expect(window.requestIdleCallback).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));

    await waitFor(() => expect(window.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 4000 }));
    await waitFor(() => expect(surface).toHaveAttribute("data-liquid-glass-mode", "liquid"));
    expect(screen.getByTestId("liquid-glass-mock")).toBeInTheDocument();
  });

  it("uses fallback by default on Android without loading liquid glass", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14)");

    render(
      <LiquidGlassSurface>
        <span>Android content</span>
      </LiquidGlassSurface>,
    );
    const surface = screen.getByText("Android content").closest("[data-liquid-glass]");

    expect(surface).toHaveAttribute("data-liquid-glass-mode", "fallback");
    expect(document.documentElement).toHaveClass("liquid-glass-force-fallback");
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(screen.queryByTestId("liquid-glass-mock")).not.toBeInTheDocument();
  });

  it("allows stored enabled preference to override the Android default", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14)");
    window.localStorage.setItem("globaltrace.liquidGlass", "enabled");

    render(
      <LiquidGlassSurface>
        <span>Enabled content</span>
      </LiquidGlassSurface>,
    );
    const surface = screen.getByText("Enabled content").closest("[data-liquid-glass]");

    await waitFor(() => expect(surface).toHaveAttribute("data-liquid-glass-mode", "liquid"));
    expect(screen.getByTestId("liquid-glass-mock")).toBeInTheDocument();
  });

  it("keeps stored disabled preference in fallback mode outside Android", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X)");
    window.localStorage.setItem("globaltrace.liquidGlass", "disabled");

    render(
      <LiquidGlassSurface>
        <span>Disabled content</span>
      </LiquidGlassSurface>,
    );
    const surface = screen.getByText("Disabled content").closest("[data-liquid-glass]");

    expect(surface).toHaveAttribute("data-liquid-glass-mode", "fallback");
    expect(document.documentElement).toHaveClass("liquid-glass-force-fallback");
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(screen.queryByTestId("liquid-glass-mock")).not.toBeInTheDocument();
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

  it("exposes the panel variant class for larger glass surfaces", () => {
    render(
      <LiquidGlassSurface variant="panel">
        <span>Panel content</span>
      </LiquidGlassSurface>,
    );

    expect(screen.getByText("Panel content").closest("[data-liquid-glass]")).toHaveClass("liquid-glass-panel");
  });
});

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
