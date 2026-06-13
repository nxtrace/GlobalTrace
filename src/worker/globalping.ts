import type { GlobalpingMeasurement } from "../shared/globalping";
import { type GlobalpingProbe } from "../shared/types";
import { readJsonResponseWithLimit, trimTrailingSlash, UpstreamError } from "./http";
import { defaultFetch, withUpstreamTimeout } from "./fetcher";

export type {
  GlobalpingMeasurement,
  GlobalpingMtrHop,
  GlobalpingResultItem,
  ValidatedTraceCreate,
} from "../shared/globalping";
export { toGlobalpingMeasurementRequest, validateTraceCreate } from "../shared/globalping";

export interface GlobalpingClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

const GLOBALPING_RESPONSE_LIMIT_BYTES = 8 * 1024 * 1024;

export class GlobalpingClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: GlobalpingClientOptions = {}) {
    this.baseUrl = trimTrailingSlash(options.baseUrl || "https://api.globalping.io");
    this.fetcher = options.fetcher || defaultFetch;
  }

  async listProbes(): Promise<GlobalpingProbe[]> {
    const response = await this.fetcher(`${this.baseUrl}/v1/probes`, withUpstreamTimeout({
      headers: {
        Accept: "application/json",
        "User-Agent": "GlobalTrace/0.1",
      },
    }));
    const body = await readJsonResponseWithLimit<GlobalpingProbe[]>(response, GLOBALPING_RESPONSE_LIMIT_BYTES);
    if (!response.ok) {
      throw new UpstreamError(`Globalping probes fetch failed with HTTP ${response.status}`);
    }
    if (!Array.isArray(body)) {
      throw new UpstreamError("Globalping probes response is invalid or too large");
    }
    return body;
  }

  async getMeasurement(measurementId: string): Promise<GlobalpingMeasurement> {
    const response = await this.fetcher(`${this.baseUrl}/v1/measurements/${encodeURIComponent(measurementId)}`, withUpstreamTimeout({
      headers: {
        Accept: "application/json",
        "User-Agent": "GlobalTrace/0.1",
      },
    }));
    const body = await readJsonResponseWithLimit<GlobalpingMeasurement>(response, GLOBALPING_RESPONSE_LIMIT_BYTES);
    if (!response.ok || !body || typeof body !== "object") {
      throw new UpstreamError(`Globalping measurement fetch failed with HTTP ${response.status}`);
    }
    return body;
  }
}
