import type { TurnstileVerifyResponse } from "../shared/types";
import { defaultFetch } from "./fetcher";
import { getClientIp } from "./http";
import type { WorkerEnv } from "./env";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(
  env: WorkerEnv,
  request: Request,
  token: string | undefined,
  fetcher: typeof fetch = defaultFetch,
): Promise<TurnstileVerifyResponse> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (env.APP_ENV === "production") {
      return { success: false, errorCodes: ["missing-secret"] };
    }
    return { success: true, bypassed: true };
  }

  if (!token?.trim()) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  const response = await fetcher(SITEVERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secret,
      response: token,
      remoteip: getClientIp(request),
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    "error-codes"?: string[];
  };
  return {
    success: Boolean(response.ok && body.success),
    errorCodes: body["error-codes"],
  };
}
