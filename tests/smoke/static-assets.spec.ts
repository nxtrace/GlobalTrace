import { expect, test, type Page } from "@playwright/test";
import type {
  GlobalpingLimitResponse,
  GlobalpingProbe,
} from "../../src/shared/types";
import { SECURITY_HEADERS } from "../../src/worker/http";

test("serves the built Vite app through Worker Static Assets", async ({
  page,
  request,
}) => {
  const response = await request.get("/");
  const html = await response.text();
  expect(response.ok()).toBe(true);
  expect(html).toContain("/assets/");
  expect(html).toContain('href="/favicon.ico"');
  expect(html).toContain('name="description"');
  expectSecurityHeaders(response.headers());

  const assetPaths = Array.from(
    html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/g),
    (match) => match[1],
  );
  expect(assetPaths.length).toBeGreaterThan(0);
  for (const assetPath of assetPaths) {
    const assetResponse = await request.get(assetPath);
    expect(assetResponse.ok()).toBe(true);
    expect(assetResponse.headers()["cache-control"]).toBe(
      "public, max-age=31556952, immutable",
    );
    expectSecurityHeaders(assetResponse.headers());
  }

  const robotsResponse = await request.get("/robots.txt");
  const robots = await robotsResponse.text();
  expect(robotsResponse.ok()).toBe(true);
  expectSecurityHeaders(robotsResponse.headers());
  expect(robots).toContain("User-agent: *");
  expect(robots).not.toContain("<!doctype html>");

  const faviconResponse = await request.get("/favicon.ico");
  const favicon = await faviconResponse.body();
  expect(faviconResponse.ok()).toBe(true);
  expect(favicon.length).toBeGreaterThan(0);
  expect(faviconResponse.headers()["content-type"] || "").not.toContain(
    "text/html",
  );
  expectSecurityHeaders(faviconResponse.headers());

  const configResponse = await request.get("/api/config");
  expect(configResponse.ok()).toBe(true);
  expect(configResponse.headers()["cache-control"]).toBe("public, max-age=300");
  expect(
    configResponse.headers()["access-control-allow-origin"],
  ).toBeUndefined();
  expectSecurityHeaders(configResponse.headers());

  const consoleErrors = collectConsoleErrors(page);
  await installStaticAssetMocks(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "GlobalTrace" }),
  ).toBeVisible();
  await expect(page.getByText("全球路由追踪")).toBeVisible();
  await expect(page.getByText("1 / 1 probes 匹配")).toBeVisible();
  await expect(page.locator("[data-liquid-glass]").first()).toBeVisible();

  await page.goto("/about");
  await expect(
    page.getByRole("link", { name: /Globalping API docs/ }),
  ).toHaveAttribute("href", "https://globalping.io/docs/api.globalping.io");
  await expect(
    page.getByRole("link", { name: /NextTrace Github/ }),
  ).toHaveAttribute("href", "https://github.com/nxtrace/NTrace-core");
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

function expectSecurityHeaders(headers: Record<string, string>): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    expect(headers[key.toLowerCase()]).toBe(value);
  }
}

async function installStaticAssetMocks(page: Page): Promise<void> {
  const context = page.context();
  await context.route("**/mock-style.json", async (route) => {
    await route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#edf0f2" },
          },
        ],
      },
    });
  });
  await context.route("**/api/config", async (route) => {
    await route.fulfill({ json: { mapStyleUrl: "/mock-style.json" } });
  });
  await context.route("**/api/probes", async (route) => {
    await route.fulfill({
      json: { probes, fetchedAt: "2026-06-10T00:00:00.000Z" },
    });
  });
  await context.route("https://api.globalping.io/v1/limits", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 200, headers: globalpingCorsHeaders });
      return;
    }
    await route.fulfill({
      headers: globalpingCorsHeaders,
      json: { rateLimit: limits },
    });
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
  measurements: {
    create: { type: "ip", limit: 250, remaining: 249, reset: 60 },
  },
};

const globalpingCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers":
    "Location, Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset",
};
