import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { deferUntilIdle } from "../lib/defer";

type LiquidGlassComponent = (typeof import("liquid-glass-react"))["default"];
const LIQUID_GLASS_IDLE_TIMEOUT_MS = 4000;
const LIQUID_GLASS_STORAGE_KEY = "globaltrace.liquidGlass";
const LIQUID_GLASS_ENABLED_VALUE = "enabled";
const LIQUID_GLASS_DISABLED_VALUE = "disabled";
const LiquidGlassPreferenceContext = createContext<boolean | null>(null);
let fallbackClassReferences = 0;

interface LiquidGlassPreferenceProviderProps {
  children: ReactNode;
  enabled: boolean;
}

interface LiquidGlassSurfaceProps {
  children: ReactNode;
  className?: string;
  variant?: "button" | "toolbar" | "chip" | "panel" | "iconButton" | "floatingPanel" | "metric" | "tab";
  fullWidth?: boolean;
  interactive?: boolean;
  disabled?: boolean;
}

export function LiquidGlassPreferenceProvider({ children, enabled }: LiquidGlassPreferenceProviderProps) {
  return <LiquidGlassPreferenceContext.Provider value={enabled}>{children}</LiquidGlassPreferenceContext.Provider>;
}

export function LiquidGlassSurface({
  children,
  className = "",
  variant = "chip",
  fullWidth = false,
  interactive = false,
  disabled = false,
}: LiquidGlassSurfaceProps) {
  const liquidGlassEnabled = useLiquidGlassEnabled();
  const forceFallback = useForceFallback(liquidGlassEnabled);
  const canUseLiquid = !forceFallback && supportsGlassEffects();
  const [LiquidGlass, setLiquidGlass] = useState<LiquidGlassComponent | null>(null);
  const canRenderLiquid = canUseLiquid && LiquidGlass;
  const mode = canRenderLiquid ? "liquid" : "fallback";

  useDocumentFallbackClass(forceFallback);

  useEffect(() => {
    if (!canUseLiquid || LiquidGlass) return;
    let active = true;
    const cancel = deferUntilWindowLoadIdle(() => {
      void import("liquid-glass-react").then((module) => {
        if (active) setLiquidGlass(() => module.default);
      });
    }, LIQUID_GLASS_IDLE_TIMEOUT_MS);
    return () => {
      active = false;
      cancel();
    };
  }, [LiquidGlass, canUseLiquid]);

  const glassProps = liquidPropsForVariant(variant);
  const interactiveProps = interactive && !disabled ? { onClick: noop } : {};
  const classes = [
    "liquid-glass-surface",
    `liquid-glass-${variant}`,
    fullWidth ? "liquid-glass-full" : "",
    surfaceBackdropClassName(variant),
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      data-liquid-glass
      data-liquid-glass-mode={mode}
      data-liquid-glass-interactive={interactive && !disabled ? "true" : undefined}
    >
      {canRenderLiquid ? (
        <LiquidGlass
          {...glassProps}
          {...interactiveProps}
          className="liquid-glass-package"
          padding="0"
          style={{ width: "100%" }}
        >
          <div className="liquid-glass-content">{children}</div>
        </LiquidGlass>
      ) : (
        <div className="liquid-glass-content liquid-glass-fallback-content">{children}</div>
      )}
    </div>
  );
}

function surfaceBackdropClassName(variant: LiquidGlassSurfaceProps["variant"]): string {
  return variant === "chip" ? "" : "backdrop-blur-xl";
}

function noop(): void {
  return undefined;
}

export function readStoredLiquidGlassEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(LIQUID_GLASS_STORAGE_KEY);
    if (stored === LIQUID_GLASS_ENABLED_VALUE) return true;
    if (stored === LIQUID_GLASS_DISABLED_VALUE) return false;
  } catch {
    // Liquid glass preference is best-effort.
  }
  return isAppleDevice();
}

export function writeStoredLiquidGlassEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LIQUID_GLASS_STORAGE_KEY,
      enabled ? LIQUID_GLASS_ENABLED_VALUE : LIQUID_GLASS_DISABLED_VALUE,
    );
  } catch {
    // Liquid glass preference is best-effort.
  }
}

function deferUntilWindowLoadIdle(callback: () => void, timeoutMs: number): () => void {
  if (typeof window === "undefined") return () => undefined;

  let cancelled = false;
  let cancelIdle: () => void = () => undefined;
  const scheduleIdle = () => {
    if (cancelled) return;
    cancelIdle = deferUntilIdle(callback, timeoutMs);
  };

  if (typeof document === "undefined" || document.readyState === "complete") {
    scheduleIdle();
  } else {
    window.addEventListener("load", scheduleIdle, { once: true });
  }

  return () => {
    cancelled = true;
    window.removeEventListener("load", scheduleIdle);
    cancelIdle();
  };
}

function useLiquidGlassEnabled(): boolean {
  const contextEnabled = useContext(LiquidGlassPreferenceContext);
  const [defaultEnabled] = useState(readStoredLiquidGlassEnabled);
  return contextEnabled ?? defaultEnabled;
}

function useForceFallback(liquidGlassEnabled: boolean): boolean {
  return useMemo(() => {
    if (!liquidGlassEnabled) return true;
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.has("forceGlassFallback");
  }, [liquidGlassEnabled]);
}

function useDocumentFallbackClass(forceFallback: boolean): void {
  useEffect(() => {
    if (!forceFallback || typeof document === "undefined") return;
    fallbackClassReferences += 1;
    document.documentElement.classList.add("liquid-glass-force-fallback");
    return () => {
      fallbackClassReferences = Math.max(0, fallbackClassReferences - 1);
      if (fallbackClassReferences === 0) {
        document.documentElement.classList.remove("liquid-glass-force-fallback");
      }
    };
  }, [forceFallback]);
}

export function isAppleDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const navigatorWithUaData = navigator as Navigator & { userAgentData?: { platform?: string } };
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return [navigator.userAgent, navigator.platform, navigatorWithUaData.userAgentData?.platform].some((value) =>
    /\b(macintosh|mac os x|macintel|macos|iphone|ipad|ipod|ios)\b/i.test(value || ""),
  );
}

function supportsGlassEffects(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
  const supportsBackdrop =
    CSS.supports("backdrop-filter: blur(1px)") || CSS.supports("-webkit-backdrop-filter: blur(1px)");
  const supportsSvgFilter = CSS.supports("filter: blur(1px)");
  return supportsBackdrop && supportsSvgFilter;
}

function liquidPropsForVariant(variant: NonNullable<LiquidGlassSurfaceProps["variant"]>) {
  if (variant === "iconButton") {
    return {
      displacementScale: 62,
      blurAmount: 0.058,
      saturation: 148,
      aberrationIntensity: 1.95,
      elasticity: 0.22,
      cornerRadius: 999,
      overLight: true,
      mode: "standard" as const,
    };
  }

  if (variant === "button") {
    return {
      displacementScale: 56,
      blurAmount: 0.052,
      saturation: 142,
      aberrationIntensity: 1.8,
      elasticity: 0.18,
      cornerRadius: 999,
      overLight: true,
      mode: "standard" as const,
    };
  }

  if (variant === "tab") {
    return {
      displacementScale: 42,
      blurAmount: 0.046,
      saturation: 144,
      aberrationIntensity: 1.45,
      elasticity: 0.12,
      cornerRadius: 999,
      overLight: false,
      mode: "standard" as const,
    };
  }

  if (variant === "toolbar") {
    return {
      displacementScale: 38,
      blurAmount: 0.044,
      saturation: 142,
      aberrationIntensity: 1.35,
      elasticity: 0.1,
      cornerRadius: 18,
      overLight: false,
      mode: "standard" as const,
    };
  }

  if (variant === "metric") {
    return {
      displacementScale: 36,
      blurAmount: 0.042,
      saturation: 144,
      aberrationIntensity: 1.3,
      elasticity: 0.1,
      cornerRadius: 16,
      overLight: false,
      mode: "standard" as const,
    };
  }

  if (variant === "floatingPanel") {
    return {
      displacementScale: 34,
      blurAmount: 0.048,
      saturation: 144,
      aberrationIntensity: 1.25,
      elasticity: 0.09,
      cornerRadius: 24,
      overLight: false,
      mode: "standard" as const,
    };
  }

  if (variant === "panel") {
    return {
      displacementScale: 28,
      blurAmount: 0.036,
      saturation: 142,
      aberrationIntensity: 1.05,
      elasticity: 0.07,
      cornerRadius: 18,
      overLight: false,
      mode: "standard" as const,
    };
  }

  return {
    displacementScale: 30,
    blurAmount: 0.034,
    saturation: 140,
    aberrationIntensity: 1.05,
    elasticity: 0.08,
    cornerRadius: 999,
    overLight: false,
    mode: "standard" as const,
  };
}
