export type ThemeMode = "system" | "light" | "dark";

export const THEME_MODES: ThemeMode[] = ["system", "light", "dark"];

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  const index = THEME_MODES.indexOf(mode);
  return THEME_MODES[(index + 1) % THEME_MODES.length] || "system";
}

export function themeModeLabel(mode: ThemeMode): string {
  if (mode === "light") return "Light";
  if (mode === "dark") return "Dark";
  return "System";
}
