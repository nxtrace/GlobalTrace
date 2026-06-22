import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePersistentAppSettings } from "./usePersistentAppSettings";

describe("usePersistentAppSettings", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createLocalStorage(),
    });
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["en-US"],
    });
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "en-US",
    });
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "localStorage");
    Reflect.deleteProperty(navigator, "languages");
    Reflect.deleteProperty(navigator, "language");
    delete document.documentElement.dataset.theme;
  });

  it("loads defaults and persists theme, liquid glass, and result layout changes", () => {
    const { result } = renderHook(() => usePersistentAppSettings());

    expect(result.current.themeMode).toBe("system");
    expect(result.current.liquidGlassEnabled).toBe(false);
    expect(result.current.liquidGlassIntensity).toBe(70);
    expect(result.current.resultMapProjection).toBe("mercator");
    expect(result.current.resultContentOrder).toBe("map-first");
    expect(result.current.resultContentOrderPromptOpen).toBe(true);
    expect(result.current.locale).toBe("en-US");
    expect(document.documentElement.dataset.theme).toBe("system");

    act(() => result.current.cycleThemeMode());
    expect(result.current.themeMode).toBe("light");
    expect(window.localStorage.getItem("globaltrace.themeMode")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    act(() => result.current.updateLiquidGlassEnabled(true));
    act(() => result.current.updateLiquidGlassIntensity(85));
    act(() => result.current.setResultMapProjection("globe"));
    act(() => result.current.updateResultContentOrder("table-first"));
    act(() => result.current.updateLocale("zh-CN"));

    expect(result.current.liquidGlassEnabled).toBe(true);
    expect(result.current.liquidGlassIntensity).toBe(85);
    expect(result.current.resultMapProjection).toBe("globe");
    expect(result.current.resultContentOrder).toBe("table-first");
    expect(result.current.resultContentOrderPromptOpen).toBe(false);
    expect(result.current.locale).toBe("zh-CN");
    expect(window.localStorage.getItem("globaltrace.liquidGlass")).toBe("enabled");
    expect(window.localStorage.getItem("globaltrace.liquidGlassIntensity")).toBe("85");
    expect(window.localStorage.getItem("globaltrace.viewMode")).toBe("3d");
    expect(window.localStorage.getItem("globaltrace.resultLayout")).toBe("table-first");
    expect(window.localStorage.getItem("globaltrace.locale")).toBe("zh-CN");
  });

  it("loads stored settings and ignores invalid stored values", () => {
    window.localStorage.setItem("globaltrace.themeMode", "dark");
    window.localStorage.setItem("globaltrace.liquidGlass", "enabled");
    window.localStorage.setItem("globaltrace.liquidGlassIntensity", "150");
    window.localStorage.setItem("globaltrace.viewMode", "3d");
    window.localStorage.setItem("globaltrace.resultLayout", "table-first");
    window.localStorage.setItem("globaltrace.locale", "zh-CN");

    const { result, unmount } = renderHook(() => usePersistentAppSettings());

    expect(result.current.themeMode).toBe("dark");
    expect(result.current.liquidGlassEnabled).toBe(true);
    expect(result.current.liquidGlassIntensity).toBe(100);
    expect(result.current.resultMapProjection).toBe("globe");
    expect(result.current.resultContentOrder).toBe("table-first");
    expect(result.current.resultContentOrderPromptOpen).toBe(false);
    expect(result.current.locale).toBe("zh-CN");

    unmount();
    window.localStorage.setItem("globaltrace.themeMode", "sepia");
    window.localStorage.setItem("globaltrace.liquidGlass", "unknown");
    window.localStorage.setItem("globaltrace.liquidGlassIntensity", "not-a-number");
    window.localStorage.setItem("globaltrace.viewMode", "flat");
    window.localStorage.setItem("globaltrace.resultLayout", "split");
    window.localStorage.setItem("globaltrace.locale", "fr-FR");

    const invalid = renderHook(() => usePersistentAppSettings());

    expect(invalid.result.current.themeMode).toBe("system");
    expect(invalid.result.current.liquidGlassEnabled).toBe(false);
    expect(invalid.result.current.liquidGlassIntensity).toBe(70);
    expect(invalid.result.current.resultMapProjection).toBe("mercator");
    expect(invalid.result.current.resultContentOrder).toBe("map-first");
    expect(invalid.result.current.resultContentOrderPromptOpen).toBe(true);
    expect(invalid.result.current.locale).toBe("en-US");
  });

  it("uses browser Chinese locale when no stored locale exists", () => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["zh-CN", "en-US"],
    });
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "zh-CN",
    });

    const { result } = renderHook(() => usePersistentAppSettings());

    expect(result.current.locale).toBe("zh-CN");
  });
});

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
