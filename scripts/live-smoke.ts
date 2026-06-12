/// <reference types="node" />

import { createApp } from "../src/worker/app";
import type { WorkerEnv } from "../src/worker/env";
import {
  type GlobalpingMeasurement,
  toGlobalpingMeasurementRequest,
  validateTraceCreate,
} from "../src/shared/globalping";

if (process.env.GLOBALTRACE_LIVE_SMOKE !== "1" || !process.env.NXTRACE_API_V4_TOKEN) {
  console.log("live smoke skipped: set GLOBALTRACE_LIVE_SMOKE=1 and NXTRACE_API_V4_TOKEN");
  process.exit(0);
}

const env: WorkerEnv = {
  ASSETS: { fetch: () => Promise.resolve(new Response("ok")) } as unknown as Fetcher,
  APP_ENV: "development",
  GLOBALPING_API_BASE: "https://api.globalping.io",
  NXTRACE_API_BASE: "https://api.nxtrace.org",
  NXTRACE_API_V4_TOKEN: process.env.NXTRACE_API_V4_TOKEN,
};

const app = createApp();
const createInput = validateTraceCreate({
  target: "globalping.io",
  limit: 1,
  packets: 1,
  filters: { magic: "world" },
});
const create = await fetch("https://api.globalping.io/v1/measurements", {
  method: "POST",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  body: JSON.stringify(toGlobalpingMeasurementRequest(createInput)),
});

if (create.status !== 202) {
  throw new Error(`create failed: ${create.status} ${await create.text()}`);
}

const created = (await create.json()) as { id: string };
let lastStatus = "";
for (let attempt = 0; attempt < 20; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const measurementResponse = await fetch(`https://api.globalping.io/v1/measurements/${encodeURIComponent(created.id)}`, {
    headers: { Accept: "application/json" },
  });
  if (!measurementResponse.ok) {
    throw new Error(`poll failed: ${measurementResponse.status} ${await measurementResponse.text()}`);
  }
  const measurement = (await measurementResponse.json()) as GlobalpingMeasurement;
  lastStatus = measurement.status;
  if (measurement.status !== "in-progress") {
    const response = await app.fetch(
      new Request("https://globaltrace.local/api/trace/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurementId: created.id }),
      }),
      env,
    );
    if (!response.ok) {
      throw new Error(`enrich failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as {
      measurementId?: string;
      status: string;
      probesCount?: number;
      results?: unknown[];
      enrichment?: { status: string };
    };
    if (body.measurementId !== created.id) {
      throw new Error(`unexpected measurementId: ${body.measurementId}`);
    }
    if (!body.enrichment?.status) {
      throw new Error("missing enrichment status");
    }
    if (typeof body.probesCount !== "number" || !Array.isArray(body.results)) {
      throw new Error("unexpected trace result shape");
    }
    console.log(`live smoke ok: ${created.id} status=${body.status} geo=${body.enrichment?.status}`);
    process.exit(0);
  }
}

throw new Error(`measurement did not finish, last status=${lastStatus}`);
