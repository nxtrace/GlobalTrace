import type { GlobalpingMeasurement } from "../shared/globalping";
import { type GlobalpingProbe } from "../shared/types";
import { trimTrailingSlash, UpstreamError } from "./http";
import { defaultFetch } from "./fetcher";

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

export class GlobalpingClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: GlobalpingClientOptions = {}) {
    this.baseUrl = trimTrailingSlash(options.baseUrl || "https://api.globalping.io");
    this.fetcher = options.fetcher || defaultFetch;
  }

  async listProbes(): Promise<GlobalpingProbe[]> {
    const response = await this.fetcher(`${this.baseUrl}/v1/probes`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "GlobalTrace/0.1",
      },
    });
    const body = (await response.json().catch(() => null)) as GlobalpingProbe[] | null;
    if (!response.ok || !Array.isArray(body)) {
      throw new UpstreamError(`Globalping probes fetch failed with HTTP ${response.status}`);
    }
    return body;
  }

  async getMeasurement(measurementId: string): Promise<GlobalpingMeasurement> {
    const response = await this.fetcher(`${this.baseUrl}/v1/measurements/${encodeURIComponent(measurementId)}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "GlobalTrace/0.1",
      },
    });
    const body = (await response.json().catch(() => null)) as GlobalpingMeasurement | null;
    if (!response.ok || !body || typeof body !== "object") {
      throw new UpstreamError(`Globalping measurement fetch failed with HTTP ${response.status}`);
    }
    return body;
  }
}
