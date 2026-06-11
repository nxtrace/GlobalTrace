import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("frontend class name helper", () => {
  it("merges conditional class names and resolves Tailwind conflicts", () => {
    expect(cn("px-2", undefined, ["py-1", "px-4"], { block: true })).toBe("py-1 px-4 block");
  });
});
