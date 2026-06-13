import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiquidGlassSurface } from "./LiquidGlassSurface";

const liquidGlassCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("liquid-glass-react", () => ({
  default: (props: { children: ReactNode }) => {
    liquidGlassCalls.push(props as unknown as Record<string, unknown>);
    return <div data-testid="liquid-glass-mock">{props.children}</div>;
  },
}));

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
  setNavigatorDevice({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)", platform: "Linux x86_64" });
  vi.stubGlobal("CSS", { supports: vi.fn(() => true) });
  vi.stubGlobal(
    "requestIdleCallback",
    vi.fn((idleCallback: IdleRequestCallback) =>
      window.setTimeout(() => idleCallback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline), 0),
    ),
  );
  vi.stubGlobal("cancelIdleCallback", vi.fn((id: number) => window.clearTimeout(id)));
  liquidGlassCalls.length = 0;
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
    setNavigatorDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });
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

  it.each([
    ["macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0, undefined],
    ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 0, undefined],
    ["iPad", "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "iPad", 0, undefined],
    ["iPadOS desktop mode", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5, undefined],
    ["userAgentData macOS", "GlobalTrace Test Agent", "", 0, "macOS"],
  ])("loads liquid glass by default on %s", async (_label, userAgent, platform, maxTouchPoints, userAgentDataPlatform) => {
    setNavigatorDevice({ userAgent, platform, maxTouchPoints, userAgentDataPlatform });

    render(
      <LiquidGlassSurface>
        <span>Apple content</span>
      </LiquidGlassSurface>,
    );
    const surface = screen.getByText("Apple content").closest("[data-liquid-glass]");

    await waitFor(() => expect(surface).toHaveAttribute("data-liquid-glass-mode", "liquid"));
    expect(screen.getByTestId("liquid-glass-mock")).toBeInTheDocument();
  });

  it.each([
    ["Android", "Mozilla/5.0 (Linux; Android 14)", "Linux armv8l"],
    ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32"],
    ["Linux", "Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64"],
    ["unknown", "GlobalTrace Test Agent", ""],
  ])("uses fallback by default on %s without loading liquid glass", (_label, userAgent, platform) => {
    setNavigatorDevice({ userAgent, platform });

    render(
      <LiquidGlassSurface>
        <span>Non-Apple content</span>
      </LiquidGlassSurface>,
    );
    const surface = screen.getByText("Non-Apple content").closest("[data-liquid-glass]");

    expect(surface).toHaveAttribute("data-liquid-glass-mode", "fallback");
    expect(document.documentElement).toHaveClass("liquid-glass-force-fallback");
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(screen.queryByTestId("liquid-glass-mock")).not.toBeInTheDocument();
  });

  it("allows stored enabled preference to override the non-Apple default", async () => {
    setNavigatorDevice({ userAgent: "Mozilla/5.0 (Linux; Android 14)", platform: "Linux armv8l" });
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

  it("keeps stored disabled preference in fallback mode on Apple devices", () => {
    setNavigatorDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });
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
    setNavigatorDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });
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

  it.each(["iconButton", "floatingPanel", "metric", "tab"] as const)(
    "exposes the %s variant class for targeted glass surfaces",
    (variant) => {
      render(
        <LiquidGlassSurface variant={variant}>
          <span>Targeted content</span>
        </LiquidGlassSurface>,
      );

      expect(screen.getByText("Targeted content").closest("[data-liquid-glass]")).toHaveClass(`liquid-glass-${variant}`);
    },
  );

  it.each([
    [
      "iconButton",
      {
        displacementScale: 62,
        blurAmount: 0.058,
        saturation: 148,
        aberrationIntensity: 1.95,
        elasticity: 0.22,
        cornerRadius: 999,
        overLight: false,
        mode: "standard",
      },
    ],
    [
      "button",
      {
        displacementScale: 56,
        blurAmount: 0.052,
        saturation: 142,
        aberrationIntensity: 1.8,
        elasticity: 0.18,
        cornerRadius: 999,
        overLight: false,
        mode: "standard",
      },
    ],
    [
      "tab",
      {
        displacementScale: 42,
        blurAmount: 0.046,
        saturation: 144,
        aberrationIntensity: 1.45,
        elasticity: 0.12,
        cornerRadius: 999,
        overLight: false,
        mode: "standard",
      },
    ],
    [
      "toolbar",
      {
        displacementScale: 38,
        blurAmount: 0.044,
        saturation: 142,
        aberrationIntensity: 1.35,
        elasticity: 0.1,
        cornerRadius: 18,
        overLight: false,
        mode: "standard",
      },
    ],
    [
      "metric",
      {
        displacementScale: 36,
        blurAmount: 0.042,
        saturation: 144,
        aberrationIntensity: 1.3,
        elasticity: 0.1,
        cornerRadius: 16,
        overLight: false,
        mode: "standard",
      },
    ],
    [
      "floatingPanel",
      {
        displacementScale: 34,
        blurAmount: 0.048,
        saturation: 144,
        aberrationIntensity: 1.25,
        elasticity: 0.09,
        cornerRadius: 24,
        overLight: false,
        mode: "standard",
      },
    ],
    [
      "panel",
      {
        displacementScale: 28,
        blurAmount: 0.036,
        saturation: 142,
        aberrationIntensity: 1.05,
        elasticity: 0.07,
        cornerRadius: 18,
        overLight: false,
        mode: "standard",
      },
    ],
  ] as const)("passes restrained liquid glass props for the %s variant", async (variant, expectedProps) => {
    setNavigatorDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });

    render(
      <LiquidGlassSurface variant={variant}>
        <span>Variant content</span>
      </LiquidGlassSurface>,
    );

    await waitFor(() => expect(liquidGlassCalls).toHaveLength(1));
    expect(liquidGlassCalls[0]).toMatchObject(expectedProps);
    expect(liquidGlassCalls[0]).not.toHaveProperty("onClick");
  });

  it("passes interactive click feedback only when enabled", async () => {
    setNavigatorDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });
    const { rerender } = render(
      <LiquidGlassSurface variant="button" interactive>
        <span>Run</span>
      </LiquidGlassSurface>,
    );

    await waitFor(() => expect(liquidGlassCalls).toHaveLength(1));
    expect(liquidGlassCalls[0]?.onClick).toEqual(expect.any(Function));
    expect(screen.getByText("Run").closest("[data-liquid-glass]")).toHaveAttribute(
      "data-liquid-glass-interactive",
      "true",
    );

    liquidGlassCalls.length = 0;
    rerender(
      <LiquidGlassSurface variant="button" interactive disabled>
        <span>Run</span>
      </LiquidGlassSurface>,
    );

    await waitFor(() => expect(liquidGlassCalls).toHaveLength(1));
    expect(liquidGlassCalls[0]).not.toHaveProperty("onClick");
    expect(screen.getByText("Run").closest("[data-liquid-glass]")).not.toHaveAttribute(
      "data-liquid-glass-interactive",
    );
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
