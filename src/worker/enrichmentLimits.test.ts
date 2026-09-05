import { describe, expect, it, vi } from "vitest";
import { admitEnrichment, admitNxtraceRequest } from "./enrichmentLimits";
import type { WorkerEnv } from "./env";

function limiter(max: number) {
  const counts = new Map<string, number>();
  return { limit: vi.fn(async ({ key }: { key: string }) => {
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    return { success: count <= max };
  }) };
}

function environment(): WorkerEnv {
  return {
    ASSETS: {} as Fetcher, APP_ENV: "production",
    ENRICH_CLIENT_LIMITER: limiter(10), ENRICH_MEASUREMENT_LIMITER: limiter(1), NXTRACE_UPSTREAM_LIMITER: limiter(120),
  };
}

function request(ip = "192.0.2.1", forwarded = "198.51.100.1") {
  return new Request("https://globaltrace.test/api/trace/enrich", {
    headers: { "CF-Connecting-IP": ip, "X-Forwarded-For": forwarded },
  });
}

describe("shared enrichment admission", () => {
  it("limits different IDs from one IP even with forged forwarding headers", async () => {
    const env = environment();
    for (let i = 0; i < 10; i++) await admitEnrichment(request(undefined, `198.51.100.${i}`), env, `m${i}`);
    await expect(admitEnrichment(request(undefined, "8.8.8.8"), env, "m11")).rejects.toMatchObject({ status: 429, code: "ENRICH_RATE_LIMITED" });
    await expect(admitEnrichment(request("192.0.2.2"), env, "m11")).resolves.toBeUndefined();
    expect(env.NXTRACE_UPSTREAM_LIMITER!.limit).not.toHaveBeenCalled();
  });

  it("rejects concurrent same-ID replays across different clients", async () => {
    const env = environment();
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => admitEnrichment(request(`192.0.2.${i}`), env, "same")));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(4);
  });

  it.each(["ENRICH_CLIENT_LIMITER", "ENRICH_MEASUREMENT_LIMITER", "NXTRACE_UPSTREAM_LIMITER"] as const)("fails closed without %s", async (name) => {
    const env = environment();
    delete env[name];
    await expect(admitEnrichment(request(), env, "m1")).rejects.toMatchObject({ status: 503, code: "ENRICH_UNAVAILABLE" });
  });

  it("requires a trusted address outside explicit loopback development", async () => {
    const env = environment();
    const noAddress = new Request("https://globaltrace.test", { headers: { "X-Forwarded-For": "192.0.2.1" } });
    await expect(admitEnrichment(noAddress, env, "m1")).rejects.toMatchObject({ status: 503 });
    env.APP_ENV = "development";
    await expect(admitEnrichment(noAddress, env, "m1")).rejects.toMatchObject({ status: 503 });
    await admitEnrichment(new Request("http://localhost/api/trace/enrich"), env, "m1");
    expect(env.ENRICH_CLIENT_LIMITER!.limit).toHaveBeenCalledWith({ key: "local" });
  });

  it.each([undefined, { success: "true" }, { success: null }])("fails closed on malformed outcome %j", async (result) => {
    const env = environment();
    env.ENRICH_CLIENT_LIMITER = { limit: vi.fn(async () => result) } as unknown as RateLimit;
    await expect(admitEnrichment(request(), env, "m1")).rejects.toMatchObject({ status: 503 });
  });

  it("fails closed when either admission or upstream limiter throws", async () => {
    const env = environment();
    const broken = { limit: vi.fn(async () => { throw new Error("private provider details"); }) };
    env.ENRICH_MEASUREMENT_LIMITER = broken;
    await expect(admitEnrichment(request(), env, "m1")).rejects.toMatchObject({ status: 503 });
    env.NXTRACE_UPSTREAM_LIMITER = broken;
    await expect(admitNxtraceRequest(env)).rejects.toMatchObject({ reason: "unavailable", retryable: false });
  });

  it("shares upstream allowance across all callers and denies after 120 mocked grants", async () => {
    const env = environment();
    for (let i = 0; i < 120; i++) await admitNxtraceRequest(env);
    await expect(admitNxtraceRequest(env)).rejects.toMatchObject({ reason: "limited", retryAfter: "60" });
    expect(env.NXTRACE_UPSTREAM_LIMITER!.limit).toHaveBeenLastCalledWith({ key: "shared" });
  });
});
