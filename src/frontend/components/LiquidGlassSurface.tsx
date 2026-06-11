import { type ReactNode, useEffect, useMemo, useState } from "react";
import { deferUntilIdle } from "../lib/defer";

type LiquidGlassComponent = (typeof import("liquid-glass-react"))["default"];
const LIQUID_GLASS_IDLE_TIMEOUT_MS = 4000;

interface LiquidGlassSurfaceProps {
  children: ReactNode;
  className?: string;
  variant?: "button" | "toolbar" | "chip";
  fullWidth?: boolean;
}

export function LiquidGlassSurface({
  children,
  className = "",
  variant = "chip",
  fullWidth = false,
}: LiquidGlassSurfaceProps) {
  const forceFallback = useForceFallback();
  const canUseLiquid = !forceFallback && supportsGlassEffects();
  const [LiquidGlass, setLiquidGlass] = useState<LiquidGlassComponent | null>(null);
  const canRenderLiquid = canUseLiquid && LiquidGlass;
  const mode = canRenderLiquid ? "liquid" : "fallback";

  useEffect(() => {
    document.documentElement.classList.toggle("liquid-glass-force-fallback", forceFallback);
    return () => document.documentElement.classList.remove("liquid-glass-force-fallback");
  }, [forceFallback]);

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
  const classes = [
    "liquid-glass-surface",
    `liquid-glass-${variant}`,
    fullWidth ? "liquid-glass-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} data-liquid-glass data-liquid-glass-mode={mode}>
      {canRenderLiquid ? (
        <LiquidGlass {...glassProps} className="liquid-glass-package" padding="0" style={{ width: "100%" }}>
          <div className="liquid-glass-content">{children}</div>
        </LiquidGlass>
      ) : (
        <div className="liquid-glass-content liquid-glass-fallback-content">{children}</div>
      )}
    </div>
  );
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

function useForceFallback(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    if (params.has("forceGlassFallback")) return true;
    const hardwareConcurrency = window.navigator.hardwareConcurrency;
    return typeof hardwareConcurrency === "number" && hardwareConcurrency > 0 && hardwareConcurrency <= 2;
  }, []);
}

function supportsGlassEffects(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
  const supportsBackdrop =
    CSS.supports("backdrop-filter: blur(1px)") || CSS.supports("-webkit-backdrop-filter: blur(1px)");
  const supportsSvgFilter = CSS.supports("filter: blur(1px)");
  return supportsBackdrop && supportsSvgFilter;
}

function liquidPropsForVariant(variant: NonNullable<LiquidGlassSurfaceProps["variant"]>) {
  if (variant === "button") {
    return {
      displacementScale: 48,
      blurAmount: 0.04,
      saturation: 150,
      aberrationIntensity: 1.6,
      elasticity: 0.12,
      cornerRadius: 999,
      overLight: true,
      mode: "standard" as const,
    };
  }

  if (variant === "toolbar") {
    return {
      displacementScale: 30,
      blurAmount: 0.035,
      saturation: 145,
      aberrationIntensity: 1.2,
      elasticity: 0.08,
      cornerRadius: 18,
      overLight: false,
      mode: "standard" as const,
    };
  }

  return {
    displacementScale: 26,
    blurAmount: 0.03,
    saturation: 140,
    aberrationIntensity: 1,
    elasticity: 0.07,
    cornerRadius: 999,
    overLight: false,
    mode: "standard" as const,
  };
}
