import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/smoke",
  testMatch: "static-assets.spec.ts",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4188",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run build && HOME=$PWD/.wrangler-home wrangler dev --local --assets dist --port 4188",
    url: "http://127.0.0.1:4188",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
