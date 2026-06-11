/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts/write-ci-wrangler-config.mjs");
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("write-ci-wrangler-config", () => {
  it("requires all production deployment environment values", () => {
    const outputPath = tempOutputPath();
    const result = runScript(outputPath, {
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      GLOBALTRACE_HOSTNAME: "globaltrace.example.com",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("TURNSTILE_SITE_KEY is required");
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects hostnames with protocol, path, or spaces", () => {
    const outputPath = tempOutputPath();
    const result = runScript(outputPath, {
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      GLOBALTRACE_HOSTNAME: "https://globaltrace.example.com/app",
      TURNSTILE_SITE_KEY: "site-key",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("GLOBALTRACE_HOSTNAME must be a bare hostname");
    expect(existsSync(outputPath)).toBe(false);
  });

  it("writes a production config without Worker secrets", () => {
    const outputPath = tempOutputPath();
    const result = runScript(outputPath, {
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      GLOBALTRACE_HOSTNAME: "globaltrace.example.com",
      TURNSTILE_SITE_KEY: "public-site-key",
    });

    expect(result.status).toBe(0);

    const config = JSON.parse(readFileSync(outputPath, "utf8")) as {
      account_id?: string;
      workers_dev?: boolean;
      routes?: Array<{ pattern?: string; custom_domain?: boolean }>;
      vars?: Record<string, string>;
    };
    expect(config.account_id).toBe("account-id");
    expect(config.workers_dev).toBe(false);
    expect(config.routes).toEqual([{ pattern: "globaltrace.example.com", custom_domain: true }]);
    expect(config.vars).toMatchObject({
      APP_ENV: "production",
      TURNSTILE_SITE_KEY: "public-site-key",
      GLOBALPING_API_BASE: "https://api.globalping.io",
      NXTRACE_API_BASE: "https://api.nxtrace.org",
    });
    expect(JSON.stringify(config.vars)).not.toContain("NXTRACE_API_V4_TOKEN");
    expect(JSON.stringify(config.vars)).not.toContain("TURNSTILE_SECRET_KEY");
  });
});

function tempOutputPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "globaltrace-wrangler-ci-"));
  tempDirs.push(dir);
  return path.join(dir, "wrangler-ci.jsonc");
}

function runScript(outputPath: string, env: Record<string, string | undefined>) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH || "",
      CI_WRANGLER_CONFIG_OUT: outputPath,
      ...env,
    },
  });
}
