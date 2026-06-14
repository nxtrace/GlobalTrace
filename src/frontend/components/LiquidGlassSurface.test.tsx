import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LiquidGlassPreferenceProvider,
  LiquidGlassSurface,
  readStoredLiquidGlassIntensity,
  writeStoredLiquidGlassIntensity,
} from "./LiquidGlassSurface";

const liquidGlassCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("liquid-glass-react", () => ({
  default: (props: { children: ReactNode; onClick?: () => void }) => {
    liquidGlassCalls.push(props as unknown as Record<string, unknown>);
    return (
      <div data-testid="liquid-glass-mock" onClick={props.onClick}>
        {props.children}
      </div>
    );
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
    window.localStorage.setItem("globaltrace.liquidGlass", "enabled");
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
  ])(
    "uses fallback by default on Apple-like %s without loading liquid glass",
    (_label, userAgent, platform, maxTouchPoints, userAgentDataPlatform) => {
      setNavigatorDevice({ userAgent, platform, maxTouchPoints, userAgentDataPlatform });

      render(
        <LiquidGlassSurface>
          <span>Apple content</span>
        </LiquidGlassSurface>,
      );
      const surface = screen.getByText("Apple content").closest("[data-liquid-glass]");

      expect(surface).toHaveAttribute("data-liquid-glass-mode", "fallback");
      expect(document.documentElement).toHaveClass("liquid-glass-force-fallback");
      expect(window.requestIdleCallback).not.toHaveBeenCalled();
      expect(screen.queryByTestId("liquid-glass-mock")).not.toBeInTheDocument();
    },
  );

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

  it("allows stored enabled preference to override the default", async () => {
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
        displacementScale: 90.098,
        blurAmount: 0.095,
        saturation: 150.944,
        aberrationIntensity: 2.908,
        elasticity: 0.318,
        cornerRadius: 999,
        overLight: false,
        mode: "prominent",
      },
    ],
    [
      "button",
      {
        displacementScale: 84.941,
        blurAmount: 0.09,
        saturation: 148.839,
        aberrationIntensity: 2.673,
        elasticity: 0.287,
        cornerRadius: 999,
        overLight: false,
        mode: "prominent",
      },
    ],
    [
      "tab",
      {
        displacementScale: 79.784,
        blurAmount: 0.083,
        saturation: 146.734,
        aberrationIntensity: 2.545,
        elasticity: 0.267,
        cornerRadius: 999,
        overLight: false,
        mode: "prominent",
      },
    ],
    [
      "toolbar",
      {
        displacementScale: 76.731,
        blurAmount: 0.083,
        saturation: 145.787,
        aberrationIntensity: 2.521,
        elasticity: 0.247,
        cornerRadius: 18,
        overLight: false,
        mode: "prominent",
      },
    ],
    [
      "metric",
      {
        displacementScale: 61.259,
        blurAmount: 0.068,
        saturation: 139.577,
        aberrationIntensity: 1.842,
        elasticity: 0.149,
        cornerRadius: 16,
        overLight: false,
        mode: "standard",
      },
    ],
    [
      "floatingPanel",
      {
        displacementScale: 66.416,
        blurAmount: 0.074,
        saturation: 141.682,
        aberrationIntensity: 2,
        elasticity: 0.175,
        cornerRadius: 24,
        overLight: false,
        mode: "standard",
      },
    ],
    [
      "panel",
      {
        displacementScale: 62.416,
        blurAmount: 0.071,
        saturation: 140.63,
        aberrationIntensity: 1.871,
        elasticity: 0.159,
        cornerRadius: 18,
        overLight: false,
        mode: "standard",
      },
    ],
    [
      "chip",
      {
        displacementScale: 77.679,
        blurAmount: 0.083,
        saturation: 145.787,
        aberrationIntensity: 2.416,
        elasticity: 0.247,
        cornerRadius: 999,
        overLight: false,
        mode: "prominent",
      },
    ],
  ] as const)("passes stronger reference-oriented liquid glass props for the %s variant", async (variant, expectedProps) => {
    setNavigatorDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });
    window.localStorage.setItem("globaltrace.liquidGlass", "enabled");

    render(
      <LiquidGlassSurface variant={variant}>
        <span>Variant content</span>
      </LiquidGlassSurface>,
    );

    await waitFor(() => expect(liquidGlassCalls).toHaveLength(1));
    expect(liquidGlassCalls[0]).toMatchObject(expectedProps);
    expect(liquidGlassCalls[0]).not.toHaveProperty("onClick");
    expect(screen.getByText("Variant content").closest("[data-liquid-glass]")).toHaveAttribute(
      "data-liquid-glass-intensity",
      "70",
    );
  });

  it.each([
    ["button", "prominent", 120, 0.13, 4, 0.42],
    ["iconButton", "prominent", 128, 0.14, 4.4, 0.46],
    ["tab", "prominent", 112, 0.12, 3.8, 0.4],
    ["chip", "prominent", 108, 0.12, 3.6, 0.38],
    ["toolbar", "prominent", 108, 0.12, 3.8, 0.38],
    ["floatingPanel", "standard", 92, 0.105, 2.9, 0.26],
    ["panel", "standard", 88, 0.1, 2.7, 0.24],
    ["metric", "standard", 84, 0.095, 2.6, 0.22],
  ] as const)(
    "maps intensity 100 to the reference-strength range for %s",
    async (variant, expectedMode, displacementScale, blurAmount, aberrationIntensity, elasticity) => {
      setNavigatorDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });

      render(
        <LiquidGlassPreferenceProvider enabled intensity={100}>
          <LiquidGlassSurface variant={variant}>
            <span>Max intensity content</span>
          </LiquidGlassSurface>
        </LiquidGlassPreferenceProvider>,
      );

      await waitFor(() => expect(liquidGlassCalls).toHaveLength(1));
      expect(liquidGlassCalls[0]).toMatchObject({
        displacementScale,
        blurAmount,
        aberrationIntensity,
        elasticity,
        overLight: true,
        mode: expectedMode,
      });
      expect(screen.getByText("Max intensity content").closest("[data-liquid-glass]")).toHaveAttribute(
        "data-liquid-glass-intensity",
        "100",
      );
      expect(screen.getByText("Max intensity content").closest("[data-liquid-glass]")).toHaveAttribute(
        "data-liquid-glass-demo-intensity",
        "true",
      );
    },
  );

  it("maps stored intensity into stronger liquid glass props", async () => {
    setNavigatorDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });

    const { rerender } = render(
      <LiquidGlassPreferenceProvider enabled intensity={20}>
        <LiquidGlassSurface variant="button">
          <span>Intensity content</span>
        </LiquidGlassSurface>
      </LiquidGlassPreferenceProvider>,
    );

    await waitFor(() => expect(liquidGlassCalls).toHaveLength(1));
    const lowIntensityProps = liquidGlassCalls[0];
    expect(screen.getByText("Intensity content").closest("[data-liquid-glass]")).toHaveAttribute(
      "data-liquid-glass-intensity",
      "20",
    );

    rerender(
      <LiquidGlassPreferenceProvider enabled intensity={90}>
        <LiquidGlassSurface variant="button">
          <span>Intensity content</span>
        </LiquidGlassSurface>
      </LiquidGlassPreferenceProvider>,
    );

    await waitFor(() => expect(liquidGlassCalls).toHaveLength(2));
    const highIntensityProps = liquidGlassCalls[1];
    expect(highIntensityProps.displacementScale as number).toBeGreaterThan(lowIntensityProps.displacementScale as number);
    expect(highIntensityProps.aberrationIntensity as number).toBeGreaterThan(
      lowIntensityProps.aberrationIntensity as number,
    );
    expect(highIntensityProps.elasticity as number).toBeGreaterThan(lowIntensityProps.elasticity as number);
    expect(screen.getByText("Intensity content").closest("[data-liquid-glass]")).toHaveAttribute(
      "data-liquid-glass-intensity",
      "90",
    );
  });

  it("marks Safari and Firefox as partial displacement browsers without forcing fallback", async () => {
    setNavigatorDevice({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
    });
    window.localStorage.setItem("globaltrace.liquidGlass", "enabled");

    const { rerender } = render(
      <LiquidGlassSurface variant="button">
        <span>Partial displacement content</span>
      </LiquidGlassSurface>,
    );

    const safariSurface = screen.getByText("Partial displacement content").closest("[data-liquid-glass]");
    await waitFor(() => expect(safariSurface).toHaveAttribute("data-liquid-glass-mode", "liquid"));
    expect(safariSurface).toHaveAttribute("data-liquid-glass-partial-displacement", "true");

    rerender(
      <LiquidGlassPreferenceProvider enabled intensity={70}>
        <LiquidGlassSurface variant="button">
          <span>Partial displacement content</span>
        </LiquidGlassSurface>
      </LiquidGlassPreferenceProvider>,
    );
    setNavigatorDevice({ userAgent: "Mozilla/5.0 Firefox/129.0", platform: "MacIntel" });
    rerender(
      <LiquidGlassPreferenceProvider enabled intensity={70}>
        <LiquidGlassSurface variant="button">
          <span>Partial displacement content</span>
        </LiquidGlassSurface>
      </LiquidGlassPreferenceProvider>,
    );

    const firefoxSurface = screen.getByText("Partial displacement content").closest("[data-liquid-glass]");
    await waitFor(() => expect(firefoxSurface).toHaveAttribute("data-liquid-glass-mode", "liquid"));
    expect(firefoxSurface).toHaveAttribute("data-liquid-glass-partial-displacement", "true");
  });

  it("does not mark Chromium as a partial displacement browser", async () => {
    setNavigatorDevice({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      platform: "MacIntel",
    });
    window.localStorage.setItem("globaltrace.liquidGlass", "enabled");

    render(
      <LiquidGlassSurface variant="button">
        <span>Chromium content</span>
      </LiquidGlassSurface>,
    );

    const surface = screen.getByText("Chromium content").closest("[data-liquid-glass]");
    await waitFor(() => expect(surface).toHaveAttribute("data-liquid-glass-mode", "liquid"));
    expect(surface).not.toHaveAttribute("data-liquid-glass-partial-displacement");
  });

  it("persists liquid glass intensity with clamped defaults", () => {
    expect(readStoredLiquidGlassIntensity()).toBe(70);
    window.localStorage.setItem("globaltrace.liquidGlassIntensity", "not-a-number");
    expect(readStoredLiquidGlassIntensity()).toBe(70);

    writeStoredLiquidGlassIntensity(118);
    expect(window.localStorage.getItem("globaltrace.liquidGlassIntensity")).toBe("100");
    writeStoredLiquidGlassIntensity(-4);
    expect(window.localStorage.getItem("globaltrace.liquidGlassIntensity")).toBe("0");
  });

  it("passes interactive click feedback only when enabled", async () => {
    setNavigatorDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });
    window.localStorage.setItem("globaltrace.liquidGlass", "enabled");
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

  it("handles explicit click surfaces from the accessible root", async () => {
    setNavigatorDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });
    window.localStorage.setItem("globaltrace.liquidGlass", "enabled");
    const onClick = vi.fn();

    render(
      <LiquidGlassSurface variant="button" onClick={onClick}>
        <span>Open result</span>
      </LiquidGlassSurface>,
    );

    await waitFor(() => expect(liquidGlassCalls).toHaveLength(1));
    expect(liquidGlassCalls[0]?.onClick).toBe(onClick);
    const surface = screen.getByText("Open result").closest("[data-liquid-glass]");
    expect(surface).toHaveAttribute("role", "button");
    fireEvent.keyDown(surface as Element, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("liquid-glass-mock"));
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Open result").closest("[data-liquid-glass]")).toHaveAttribute(
      "data-liquid-glass-interactive",
      "true",
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
