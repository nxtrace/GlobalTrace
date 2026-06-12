export interface WorkerEnv {
  ASSETS: Fetcher;
  APP_ENV?: string;
  GLOBALPING_API_BASE?: string;
  NXTRACE_API_BASE?: string;
  NXTRACE_API_V4_TOKEN?: string;
  MAP_STYLE_URL?: string;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}
