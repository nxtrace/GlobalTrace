import { describe, expect, it } from "vitest";
import { countryDisplayName, countrySuggestionLabel } from "./countryNames";

describe("countryNames", () => {
  it("resolves ISO codes to localized region names", () => {
    expect(countryDisplayName("US", "en-US")).toBe("United States");
    expect(countryDisplayName("DE", "en-US")).toBe("Germany");
    expect(countryDisplayName("us", "zh-CN")).toBe("美国");
    expect(countryDisplayName("DE", "zh-CN")).toBe("德国");
  });

  it("formats suggestion labels with code suffixes", () => {
    expect(countrySuggestionLabel("JP", "en-US")).toBe("Japan (JP)");
    expect(countrySuggestionLabel("JP", "zh-CN")).toBe("日本 (JP)");
    expect(countrySuggestionLabel("not-a-code", "en-US")).toBe("not-a-code");
  });
});
