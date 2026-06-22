import { useCallback, useEffect, useState } from "react";
import {
  readStoredLiquidGlassEnabled,
  readStoredLiquidGlassIntensity,
  writeStoredLiquidGlassEnabled,
  writeStoredLiquidGlassIntensity,
} from "../components/LiquidGlassSurface";
import type { MapProjection, ResultContentOrder } from "../components/mapProjection";
import { nextThemeMode, type ThemeMode } from "../theme";
import {
  readStoredLocale,
  writeStoredLocale,
  type Locale,
} from "../i18n";

const THEME_STORAGE_KEY = "globaltrace.themeMode";
const RESULT_MAP_PROJECTION_STORAGE_KEY = "globaltrace.viewMode";
const RESULT_CONTENT_ORDER_STORAGE_KEY = "globaltrace.resultLayout";

export function usePersistentAppSettings() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(readStoredThemeMode);
  const [liquidGlassEnabled, setLiquidGlassEnabled] = useState(readStoredLiquidGlassEnabled);
  const [liquidGlassIntensity, setLiquidGlassIntensity] = useState(readStoredLiquidGlassIntensity);
  const [resultMapProjection, setResultMapProjection] = useState<MapProjection>(readStoredResultMapProjection);
  const [storedResultContentOrder] = useState<ResultContentOrder | null>(() => readStoredResultContentOrder());
  const [resultContentOrder, setResultContentOrder] = useState<ResultContentOrder>(storedResultContentOrder ?? "map-first");
  const [resultContentOrderPromptOpen, setResultContentOrderPromptOpen] = useState(storedResultContentOrder === null);
  const [locale, setLocale] = useState<Locale>(readStoredLocale);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    writeStoredThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    writeStoredResultMapProjection(resultMapProjection);
  }, [resultMapProjection]);

  const cycleThemeMode = useCallback(() => {
    setThemeMode((current) => nextThemeMode(current));
  }, []);

  const updateLiquidGlassEnabled = useCallback((enabled: boolean) => {
    setLiquidGlassEnabled(enabled);
    writeStoredLiquidGlassEnabled(enabled);
  }, []);

  const updateLiquidGlassIntensity = useCallback((intensity: number) => {
    setLiquidGlassIntensity(intensity);
    writeStoredLiquidGlassIntensity(intensity);
  }, []);

  const updateResultContentOrder = useCallback((order: ResultContentOrder) => {
    setResultContentOrder(order);
    writeStoredResultContentOrder(order);
    setResultContentOrderPromptOpen(false);
  }, []);

  const updateLocale = useCallback((nextLocale: Locale) => {
    setLocale(nextLocale);
    writeStoredLocale(nextLocale);
  }, []);

  return {
    themeMode,
    liquidGlassEnabled,
    liquidGlassIntensity,
    resultMapProjection,
    setResultMapProjection,
    resultContentOrder,
    resultContentOrderPromptOpen,
    locale,
    cycleThemeMode,
    updateLiquidGlassEnabled,
    updateLiquidGlassIntensity,
    updateResultContentOrder,
    updateLocale,
  };
}

function readStoredThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  } catch {
    return "system";
  }
}

function writeStoredThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Theme persistence is best-effort.
  }
}

function readStoredResultMapProjection(): MapProjection {
  try {
    return window.localStorage.getItem(RESULT_MAP_PROJECTION_STORAGE_KEY) === "3d" ? "globe" : "mercator";
  } catch {
    return "mercator";
  }
}

function writeStoredResultMapProjection(projection: MapProjection): void {
  try {
    window.localStorage.setItem(RESULT_MAP_PROJECTION_STORAGE_KEY, projection === "globe" ? "3d" : "2d");
  } catch {
    // Result map projection persistence is best-effort.
  }
}

function readStoredResultContentOrder(): ResultContentOrder | null {
  try {
    const stored = window.localStorage.getItem(RESULT_CONTENT_ORDER_STORAGE_KEY);
    return stored === "map-first" || stored === "table-first" ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredResultContentOrder(order: ResultContentOrder): void {
  try {
    window.localStorage.setItem(RESULT_CONTENT_ORDER_STORAGE_KEY, order);
  } catch {
    // Result layout persistence is best-effort.
  }
}
