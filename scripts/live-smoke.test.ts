/// <reference types="node" />

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts/live-smoke.ts");

describe("live-smoke", () => {
  it("uses the measurementId-only enrich contract and a conservative Globalping poll delay", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("setTimeout(resolve, 1000)");
    expect(source).toContain("body: JSON.stringify({ measurementId: created.id })");
    expect(source).not.toContain("body: JSON.stringify({ measurement })");
  });
});
