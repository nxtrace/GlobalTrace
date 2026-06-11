import { expect, test, type Page } from "@playwright/test";
import type { GlobalpingLimitResponse, GlobalpingProbe } from "../../src/shared/types";

test("serves the built Vite app through Worker Static Assets", async ({ page, request }) => {
  const response = await request.get("/");
  const html = await response.text();
  expect(response.ok()).toBe(true);
  expect(html).toContain("/assets/");
  expect(html).toContain('name="description"');

  const assetPath = html.match(/src="([^"]*\/assets\/[^"]+\.js)"/)?.[1];
  expect(assetPath).toBeTruthy();
  const assetResponse = await request.get(assetPath as string);
  expect(assetResponse.headers()["cache-control"]).toBe("public, max-age=31556952, immutable");

  const robotsResponse = await request.get("/robots.txt");
  const robots = await robotsResponse.text();
  expect(robotsResponse.ok()).toBe(true);
  expect(robots).toContain("User-agent: *");
  expect(robots).not.toContain("<!doctype html>");

  const consoleErrors = collectConsoleErrors(page);
  await installStaticAssetMocks(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "GlobalTrace" })).toBeVisible();
  await expect(page.getByText("基于 Globalping Probe 与 NextTrace 数据的全球 MTR 路径观测")).toBeVisible();
  await expect(page.getByText("1 / 1 probes 匹配")).toBeVisible();
  await expect(page.locator("[data-liquid-glass]").first()).toBeVisible();

  await page.goto("/about");
  await expect(page.getByRole("link", { name: /Globalping API docs/ })).toHaveAttribute(
    "href",
    "https://globalping.io/docs/api.globalping.io",
  );
  await expect(page.getByRole("link", { name: /NTrace-core GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/nxtrace/NTrace-core",
  );
  expect(consoleErrors).toEqual([]);
});

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function installStaticAssetMocks(page: Page): Promise<void> {
  await page.route("**/mock-style.json", async (route) => {
    await route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": "#edf0f2" } }],
      },
    });
  });
  await page.route("**/api/config", async (route) => {
    await route.fulfill({ json: { turnstileSiteKey: "", mapStyleUrl: "/mock-style.json" } });
  });
  await page.route("**/api/probes", async (route) => {
    await route.fulfill({ json: { probes, fetchedAt: "2026-06-10T00:00:00.000Z" } });
  });
  await page.route("https://api.globalping.io/v1/limits", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 200, headers: globalpingCorsHeaders });
      return;
    }
    await route.fulfill({ headers: globalpingCorsHeaders, json: { rateLimit: limits } });
  });
}

const probes: GlobalpingProbe[] = [
  {
    location: {
      continent: "NA",
      region: "Northern America",
      country: "US",
      state: "CA",
      city: "Los Angeles",
      asn: 7922,
      latitude: 34.05,
      longitude: -118.24,
      network: "Comcast",
    },
    tags: ["eyeball-network"],
    resolvers: [],
  },
];

const limits: GlobalpingLimitResponse = {
  measurements: { create: { type: "ip", limit: 250, remaining: 249, reset: 60 } },
};

const globalpingCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "Location, Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset",
};
