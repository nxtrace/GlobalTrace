import { NxtraceBatchError } from "../shared/nxtraceBatch";
import type { WorkerEnv } from "./env";
import { HttpError } from "./http";

export class EnrichmentAdmissionError extends HttpError {
  readonly code: "ENRICH_RATE_LIMITED" | "ENRICH_UNAVAILABLE";

  constructor(unavailable: boolean) {
    super(unavailable ? 503 : 429, unavailable ? "地理信息暂不可用" : "地理信息请求频繁，请稍后重试");
    this.code = unavailable ? "ENRICH_UNAVAILABLE" : "ENRICH_RATE_LIMITED";
  }
}

export async function admitEnrichment(request: Request, env: WorkerEnv, measurementId: string): Promise<void> {
  const hostname = new URL(request.url).hostname;
  const local = env.APP_ENV === "development" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  const client = local ? "local" : request.headers.get("CF-Connecting-IP")?.trim();
  if (!client || !env.ENRICH_CLIENT_LIMITER || !env.ENRICH_MEASUREMENT_LIMITER || !env.NXTRACE_UPSTREAM_LIMITER) {
    console.warn(JSON.stringify({ event: "enrich_admission", reason: "unavailable", attempts: 0, durationMs: 0 }));
    throw new EnrichmentAdmissionError(true);
  }
  for (const [binding, key, scope] of [
    [env.ENRICH_CLIENT_LIMITER, client, "client"],
    [env.ENRICH_MEASUREMENT_LIMITER, measurementId, "measurement"],
  ] as const) {
    const outcome = await checkLimit(binding, key, scope);
    if (outcome !== "allowed") throw new EnrichmentAdmissionError(outcome === "unavailable");
  }
}

export async function admitNxtraceRequest(env: WorkerEnv): Promise<void> {
  const outcome = await checkLimit(env.NXTRACE_UPSTREAM_LIMITER, "shared", "upstream");
  if (outcome !== "allowed") {
    throw new NxtraceBatchError(
      outcome === "unavailable" ? "地理信息暂不可用" : "地理信息请求频繁，请稍后重试",
      false, outcome, outcome === "limited" ? "60" : undefined,
    );
  }
}

async function checkLimit(binding: RateLimit | undefined, key: string, scope: string) {
  const startedAt = Date.now();
  let outcome: "allowed" | "limited" | "unavailable" = "unavailable";
  try {
    const result = await binding?.limit({ key });
    if (result?.success === true) return "allowed" as const;
    if (result?.success === false) outcome = "limited";
  } catch {
    // Never fall through to the shared credential if admission is unavailable.
  }
  console.warn(JSON.stringify({ event: "enrich_admission", scope, reason: outcome, attempts: 0, durationMs: Date.now() - startedAt }));
  return outcome;
}
