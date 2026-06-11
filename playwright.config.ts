import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/smoke",
  testMatch: "globaltrace.spec.ts",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4177",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev:frontend -- --port 4177",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
