import { describe, expect, it } from "vitest";
import { nextThemeMode, themeModeLabel } from "./theme";

describe("theme helpers", () => {
  it("cycles through the supported theme modes", () => {
    expect(nextThemeMode("system")).toBe("light");
    expect(nextThemeMode("light")).toBe("dark");
    expect(nextThemeMode("dark")).toBe("system");
  });

  it("returns the visible label for each theme mode", () => {
    expect(themeModeLabel("system")).toBe("System");
    expect(themeModeLabel("light")).toBe("Light");
    expect(themeModeLabel("dark")).toBe("Dark");
  });
});
