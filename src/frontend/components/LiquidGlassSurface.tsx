import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { deferUntilIdle } from "../lib/defer";

type LiquidGlassComponent = (typeof import("liquid-glass-react"))["default"];
const LIQUID_GLASS_IDLE_TIMEOUT_MS = 4000;
const LIQUID_GLASS_STORAGE_KEY = "globaltrace.liquidGlass";
const LIQUID_GLASS_INTENSITY_STORAGE_KEY = "globaltrace.liquidGlassIntensity";
const LIQUID_GLASS_ENABLED_VALUE = "enabled";
const LIQUID_GLASS_DISABLED_VALUE = "disabled";
export const DEFAULT_LIQUID_GLASS_INTENSITY = 70;
export const MIN_LIQUID_GLASS_INTENSITY = 0;
export const MAX_LIQUID_GLASS_INTENSITY = 100;

interface LiquidGlassPreference {
  enabled: boolean;
  intensity: number;
}

const LiquidGlassPreferenceContext = createContext<LiquidGlassPreference | null>(null);
let fallbackClassReferences = 0;

interface LiquidGlassPreferenceProviderProps {
  children: ReactNode;
  enabled: boolean;
  intensity: number;
}

interface LiquidGlassSurfaceProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  variant?: "button" | "toolbar" | "chip" | "panel" | "iconButton" | "floatingPanel" | "metric" | "tab";
  fullWidth?: boolean;
  interactive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function LiquidGlassPreferenceProvider({ children, enabled, intensity }: LiquidGlassPreferenceProviderProps) {
  const value = useMemo(
    () => ({
      enabled,
      intensity: clampLiquidGlassIntensity(intensity),
    }),
    [enabled, intensity],
  );
  return <LiquidGlassPreferenceContext.Provider value={value}>{children}</LiquidGlassPreferenceContext.Provider>;
}

export function LiquidGlassSurface({
  children,
  className = "",
  style,
  variant = "chip",
  fullWidth = false,
  interactive = false,
  disabled = false,
  onClick,
}: LiquidGlassSurfaceProps) {
  const liquidGlassPreference = useLiquidGlassPreference();
  const forceFallback = useForceFallback(liquidGlassPreference.enabled);
  const canUseLiquid = !forceFallback && supportsGlassEffects();
  const partialDisplacement = canUseLiquid && usesPartialDisplacementBrowser();
  const demoIntensity = liquidGlassPreference.intensity >= 95;
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

  const glassProps = liquidPropsForVariant(variant, liquidGlassPreference.intensity);
  const interactiveProps = !disabled && (interactive || onClick) ? { onClick: noop } : {};
  const classes = [
    "liquid-glass-surface",
    `liquid-glass-${variant}`,
    fullWidth ? "liquid-glass-full" : "",
    partialDisplacement ? "liquid-glass-partial-displacement" : "",
    demoIntensity ? "liquid-glass-demo-intensity" : "",
    surfaceBackdropClassName(variant),
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const content = canRenderLiquid ? (
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
  );

  return (
    <div
      className={classes}
      data-liquid-glass
      data-liquid-glass-mode={mode}
      data-liquid-glass-intensity={liquidGlassPreference.intensity}
      data-liquid-glass-partial-displacement={partialDisplacement ? "true" : undefined}
      data-liquid-glass-demo-intensity={demoIntensity ? "true" : undefined}
      data-liquid-glass-interactive={interactive && !disabled ? "true" : undefined}
      style={style}
      onClickCapture={onClick && !disabled ? onClick : undefined}
    >
      {content}
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
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(LIQUID_GLASS_STORAGE_KEY);
    if (stored === LIQUID_GLASS_ENABLED_VALUE) return true;
    if (stored === LIQUID_GLASS_DISABLED_VALUE) return false;
  } catch {
    // Liquid glass preference is best-effort.
  }
  return false;
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

export function readStoredLiquidGlassIntensity(): number {
  if (typeof window === "undefined") return DEFAULT_LIQUID_GLASS_INTENSITY;
  try {
    return clampLiquidGlassIntensity(window.localStorage.getItem(LIQUID_GLASS_INTENSITY_STORAGE_KEY));
  } catch {
    return DEFAULT_LIQUID_GLASS_INTENSITY;
  }
}

export function writeStoredLiquidGlassIntensity(intensity: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIQUID_GLASS_INTENSITY_STORAGE_KEY, String(clampLiquidGlassIntensity(intensity)));
  } catch {
    // Liquid glass preference is best-effort.
  }
}

export function clampLiquidGlassIntensity(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(numeric)) return DEFAULT_LIQUID_GLASS_INTENSITY;
  return Math.min(MAX_LIQUID_GLASS_INTENSITY, Math.max(MIN_LIQUID_GLASS_INTENSITY, Math.round(numeric)));
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

function useLiquidGlassPreference(): LiquidGlassPreference {
  const contextPreference = useContext(LiquidGlassPreferenceContext);
  const [defaultEnabled] = useState(readStoredLiquidGlassEnabled);
  const [defaultIntensity] = useState(readStoredLiquidGlassIntensity);
  return contextPreference ?? { enabled: defaultEnabled, intensity: defaultIntensity };
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

function usesPartialDisplacementBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /\b(firefox|fxios|safari)\b/i.test(navigator.userAgent) && !/\b(chrome|chromium|crios|edg|opr)\b/i.test(navigator.userAgent);
}

function liquidPropsForVariant(variant: NonNullable<LiquidGlassSurfaceProps["variant"]>, intensity: number) {
  const t = liquidGlassIntensityCurve(intensity);
  const demoIntensity = clampLiquidGlassIntensity(intensity) >= 95;
  const specs = {
    iconButton: {
      displacementScale: [48, 128],
      blurAmount: [0.045, 0.14],
      saturation: [132, 168],
      aberrationIntensity: [1.25, 4.4],
      elasticity: [0.16, 0.46],
      cornerRadius: 999,
      mode: "prominent" as const,
    },
    button: {
      displacementScale: [46, 120],
      blurAmount: [0.045, 0.13],
      saturation: [132, 164],
      aberrationIntensity: [1.2, 4],
      elasticity: [0.14, 0.42],
      cornerRadius: 999,
      mode: "prominent" as const,
    },
    tab: {
      displacementScale: [44, 112],
      blurAmount: [0.042, 0.12],
      saturation: [132, 160],
      aberrationIntensity: [1.15, 3.8],
      elasticity: [0.12, 0.4],
      cornerRadius: 999,
      mode: "prominent" as const,
    },
    toolbar: {
      displacementScale: [42, 108],
      blurAmount: [0.042, 0.12],
      saturation: [130, 160],
      aberrationIntensity: [1.1, 3.8],
      elasticity: [0.1, 0.38],
      cornerRadius: 18,
      mode: "prominent" as const,
    },
    metric: {
      displacementScale: [36, 84],
      blurAmount: [0.038, 0.095],
      saturation: [128, 150],
      aberrationIntensity: [1, 2.6],
      elasticity: [0.07, 0.22],
      cornerRadius: 16,
      mode: "standard" as const,
    },
    floatingPanel: {
      displacementScale: [38, 92],
      blurAmount: [0.04, 0.105],
      saturation: [128, 154],
      aberrationIntensity: [1, 2.9],
      elasticity: [0.08, 0.26],
      cornerRadius: 24,
      mode: "standard" as const,
    },
    panel: {
      displacementScale: [34, 88],
      blurAmount: [0.038, 0.1],
      saturation: [128, 152],
      aberrationIntensity: [0.95, 2.7],
      elasticity: [0.07, 0.24],
      cornerRadius: 18,
      mode: "standard" as const,
    },
    chip: {
      displacementScale: [44, 108],
      blurAmount: [0.042, 0.12],
      saturation: [130, 160],
      aberrationIntensity: [1.1, 3.6],
      elasticity: [0.1, 0.38],
      cornerRadius: 999,
      mode: "prominent" as const,
    },
  } satisfies Record<
    NonNullable<LiquidGlassSurfaceProps["variant"]>,
    {
      displacementScale: [number, number];
      blurAmount: [number, number];
      saturation: [number, number];
      aberrationIntensity: [number, number];
      elasticity: [number, number];
      cornerRadius: number;
      mode: "standard" | "prominent";
    }
  >;
  const spec = specs[variant];
  return {
    displacementScale: interpolate(spec.displacementScale, t),
    blurAmount: interpolate(spec.blurAmount, t),
    saturation: interpolate(spec.saturation, t),
    aberrationIntensity: interpolate(spec.aberrationIntensity, t),
    elasticity: interpolate(spec.elasticity, t),
    cornerRadius: spec.cornerRadius,
    overLight: demoIntensity,
    mode: spec.mode,
  };
}

function liquidGlassIntensityCurve(intensity: number): number {
  return Math.pow(clampLiquidGlassIntensity(intensity) / MAX_LIQUID_GLASS_INTENSITY, 1.8);
}

function interpolate([min, max]: [number, number], t: number): number {
  return Math.round((min + (max - min) * t) * 1000) / 1000;
}
