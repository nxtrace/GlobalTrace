import { describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "./turnstile";
import type { WorkerEnv } from "./env";

const baseEnv: WorkerEnv = {
  ASSETS: { fetch: vi.fn() } as unknown as Fetcher,
  APP_ENV: "development",
  GLOBALPING_API_BASE: "https://globalping.test",
  NXTRACE_API_BASE: "https://nxtrace.test",
};

describe("turnstile verification", () => {
  it("bypasses verification outside production when no secret is configured", async () => {
    const result = await verifyTurnstileToken(baseEnv, new Request("https://globaltrace.test"), undefined, vi.fn());

    expect(result).toEqual({ success: true, bypassed: true });
  });

  it("fails closed in production when the secret is missing", async () => {
    const result = await verifyTurnstileToken(
      { ...baseEnv, APP_ENV: "production" },
      new Request("https://globaltrace.test"),
      "token",
      vi.fn(),
    );

    expect(result).toEqual({ success: false, errorCodes: ["missing-secret"] });
  });

  it("rejects missing response tokens before calling siteverify", async () => {
    const fetcher = vi.fn();
    const result = await verifyTurnstileToken(
      { ...baseEnv, TURNSTILE_SECRET_KEY: "secret" },
      new Request("https://globaltrace.test"),
      "",
      fetcher,
    );

    expect(result).toEqual({ success: false, errorCodes: ["missing-input-response"] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the token and client IP to Cloudflare siteverify", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const result = await verifyTurnstileToken(
      { ...baseEnv, TURNSTILE_SECRET_KEY: "secret" },
      new Request("https://globaltrace.test", { headers: { "CF-Connecting-IP": "203.0.113.9" } }),
      "token",
      fetcher,
    );

    expect(result.success).toBe(true);
    const [, init] = fetcher.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      secret: "secret",
      response: "token",
      remoteip: "203.0.113.9",
    });
  });

  it("returns Cloudflare error codes for failed verification", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 }),
    );

    const result = await verifyTurnstileToken(
      { ...baseEnv, TURNSTILE_SECRET_KEY: "secret" },
      new Request("https://globaltrace.test"),
      "bad",
      fetcher,
    );

    expect(result).toEqual({ success: false, errorCodes: ["invalid-input-response"] });
  });
});
