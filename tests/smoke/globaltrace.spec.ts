import { expect, test, type Page } from "@playwright/test";
import type { GlobalpingLimitResponse, GlobalpingProbe, TraceResultResponse } from "../../src/shared/types";

const screenshotPrefix = process.env.GLOBALTRACE_SCREENSHOT_PREFIX || "globaltrace-liquid-glass";

const viewports = [
  { name: "1440x1000", width: 1440, height: 1000 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
];

for (const viewport of viewports) {
  test(`deterministic trace flow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const consoleErrors = collectConsoleErrors(page);
    const mocks = await installMocks(page, { expectedIpVersion: 6 });

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "GlobalTrace" })).toBeVisible();
    await expect(
      page.getByText(
        "GlobalTrace 是一个 Globalping x NextTrace 的开源项目，借助 Globalping 遍布全球的 Probe 发起路由追踪，并结合 NextTrace 骨干网 IP 数据库增强地理位置与网络归属信息。",
      ),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    await page.getByRole("button", { name: "主题：System" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expectLightModePanelBoundaries(page);
    await expectNoPageOverflow(page);
    await page.getByText("高级参数与精确筛选").click();
    await expect(page.getByLabel("Globalping Token")).toBeVisible();
    await expectNoPageOverflow(page);
    if (viewport.name === "390x844") {
      await page.screenshot({
        path: `/tmp/${screenshotPrefix}-light-advanced-${viewport.name}.png`,
        fullPage: true,
      });
    }
    await page.getByText("高级参数与精确筛选").click();
    await page.getByRole("button", { name: "主题：Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByText("3 / 3 probes 匹配")).toBeVisible();
    await expect(page.getByText("可创建诊断 249/250（当前 IP）")).toBeVisible();
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await expectDarkMapControls(page);
    await expect(page.locator("[data-liquid-glass]").first()).toBeVisible();
    await expect(page.locator("[data-liquid-glass]").first()).toHaveAttribute("data-liquid-glass-mode", /^(liquid|fallback)$/);
    await expect.poll(mocks.styleRequests).toBe(1);
    await expect(page.getByLabel("IP 版本")).toHaveValue("");
    await page.getByLabel("IP 版本").selectOption("6");
    await expect(page.getByLabel("IP 版本")).toHaveValue("6");

    await page.getByText("高级参数与精确筛选").click();
    await page.getByLabel("国家").fill("US");
    await expect(page.getByText("1 / 3 probes 匹配")).toBeVisible();
    await expect.poll(mocks.styleRequests).toBe(1);
    await expectMapContainsCoordinate(page, [-118.24, 34.05]);
    await expectMapProjectsCoordinateInsideCanvas(page, [-118.24, 34.05]);

    if (viewport.name === "1440x1000") {
      await boxSelectLosAngelesWithOutsideRelease(page);
      await expect(page.getByLabel("probe map").getByText("框选 1 个 probes")).toBeVisible();
      await expect(page.getByRole("button", { name: "取消地图筛选" })).toBeVisible();
      await expect(page.getByLabel("probes")).toHaveValue("1");
      await page.getByRole("button", { name: "取消地图筛选" }).click();
      await expect(page.getByText("3 / 3 probes 匹配")).toBeVisible();
      await expect(page.getByTestId("filter-chips")).toContainText("world");
      await expect(page.getByLabel("probe map").getByText("点选地图表示选择筛选条件，不承诺指定精确 probe")).toBeVisible();
      await expect(page.getByRole("button", { name: "取消地图筛选" })).toHaveCount(0);
      await expect(page.getByLabel("probes")).toHaveValue("3");
      await clickMapCoordinate(page, [-118.24, 34.05]);
      await expect(page.getByLabel("probe map").getByText("已选择 Los Angeles · AS7922")).toBeVisible();
      await expect(page.getByText("1 / 3 probes 匹配")).toBeVisible();
      await expect(page.getByTestId("filter-chips")).not.toContainText("Comcast");
    }

    await page.getByRole("button", { name: "开始网络路径诊断" }).click();
    await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
    await expect(page.getByRole("link", { name: "打开" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "复制" })).toBeVisible();
    await expect(page.getByLabel("probe map")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "在线 probes" })).toHaveCount(0);
    await expect(page.getByText("AS15169")).toBeVisible();
    await expect(page.getByText("Google LLC / Google")).toBeVisible();
    await expectHopTableColumns(page);
    await expect(page.getByLabel("trace result map")).toBeVisible();
    await expectMapCanvasPainted(page);
    await expectResultMapContainsCoordinate(page, [-118.24, 34.05]);
    await expectResultMapContainsCoordinate(page, [-122.08, 37.39]);
    await expectResultMapStyleLoaded(page);
    await expectHopTableScrollsWithinPanel(page);

    await page.getByText("raw output").click();
    await page.getByText("whois / source details").click();
    await expect(page.getByText("Host Loss% Avg")).toBeVisible();
    await expect(page.getByText(/google-whois/)).toBeVisible();
    await expect(page).toHaveURL(/measurement=m-smoke/);

    await page.getByRole("button", { name: "关闭结果" }).click();
    await expect(page.getByLabel("probe map")).toBeVisible();
    await expect(page.getByRole("heading", { name: "在线 probes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "查看结果" })).toBeVisible();
    await page.getByRole("button", { name: "查看结果" }).click();
    await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
    await expectMapCanvasPainted(page);
    await expectResultMapStyleLoaded(page);

    await page.goto("/?measurement=m-smoke");
    await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();

    await expectNoPageOverflow(page);
    await expectMapCanvasPainted(page);
    expect(consoleErrors).toEqual([]);

    await page.screenshot({
      path: `/tmp/${screenshotPrefix}-${viewport.name}.png`,
      fullPage: true,
    });
  });
}

test("desktop filter summary constrains long magic content and keeps run controls visible", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page, { turnstileSiteKey: "site-key" });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "开始网络路径诊断" })).toBeVisible();
  await page.getByText("高级参数与精确筛选").click();
  const longMagic = Array.from({ length: 20 }, (_, index) => `Novosibirsk-${index}+RU+AS${21000 + index}+datacenter-network`).join(
    ", ",
  );
  await page.getByLabel("magic string").fill(longMagic);

  await expect(page.getByTestId("filter-chips")).toContainText("Novosibirsk-0+RU+AS21000+datacenter-network");
  await expect(page.locator(".mock-turnstile-widget")).toBeVisible();
  await expect(page.getByRole("button", { name: "开始网络路径诊断" })).toBeVisible();
  await expectFilterSummaryConstrainsLongChips(page);
  await expectNoPageOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("about page exposes provider attribution links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = collectConsoleErrors(page);

  await page.goto("/about");

  await expect(page.getByRole("heading", { name: "GlobalTrace" })).toBeVisible();
  await expect(
    page.getByText(
      "GlobalTrace 是一个 Globalping x NextTrace 的开源项目，借助 Globalping 遍布全球的 Probe 发起路由追踪，并结合 NextTrace 骨干网 IP 数据库增强地理位置与网络归属信息。",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Globalping API docs/ })).toHaveAttribute(
    "href",
    "https://globalping.io/docs/api.globalping.io",
  );
  await expect(page.getByRole("link", { name: /Globalping OpenAPI spec/ })).toHaveAttribute(
    "href",
    "https://api.globalping.io/v1/spec.yaml",
  );
  await expect(page.getByRole("link", { name: /NextTrace/ })).toHaveAttribute("href", "https://www.nxtrace.org/");
  await expect(page.getByRole("link", { name: /NTrace-core GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/nxtrace/NTrace-core",
  );
  await expect(page.getByRole("link", { name: /GlobalTrace GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/nxtrace/GlobalTrace",
  );
  await expect(page.getByRole("heading", { name: "开源协议" })).toBeVisible();
  await expect(page.getByText("GlobalTrace 以 GPL-3.0-or-later 开源发布。")).toBeVisible();
  await expect(page.getByRole("link", { name: /GPL-3.0-or-later/ })).toHaveAttribute(
    "href",
    "https://github.com/nxtrace/GlobalTrace/blob/master/LICENSE",
  );
  await expect(page.getByRole("link", { name: "源码" })).toHaveAttribute("href", "https://github.com/nxtrace/GlobalTrace");
  await expectNoMapJavaScriptLoaded(page);
  await expectNoPageOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("shared measurement link shows loading while Globalping responds", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = collectConsoleErrors(page);
  let releaseMeasurement!: () => void;
  const measurementDelay = new Promise<void>((resolve) => {
    releaseMeasurement = resolve;
  });
  await installMocks(page, { beforeMeasurementResponse: () => measurementDelay });

  await page.goto("/?measurement=m-smoke");

  await expect(page.getByRole("status", { name: "正在打开分享结果" })).toBeVisible();
  await expect(page.getByText("正在读取 Globalping measurement，完成后会自动展示结果。")).toBeVisible();
  await expect(page.getByLabel("probe map")).toHaveCount(0);

  releaseMeasurement();

  await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
  await expect(page.getByRole("link", { name: "打开" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "复制" })).toBeVisible();
  await expectNoPageOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("result route map filters invalid hops and shows numbered hop markers", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page, { traceResponse: routeQualityTraceResult() });

  await page.goto("/?measurement=m-smoke");

  await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
  await expect(page.getByLabel("trace result map")).toBeVisible();
  await expectMapCanvasPainted(page);
  await expectResultRouteData(page, { labels: ["1-2", "5"], lineLength: 2, maxLineLngSpan: 140 });
  await clickResultMapRouteNode(page, "route-node-1-2");
  await expect(page.locator('.hop-table tr[data-ttl="1"]')).toHaveClass(/selected/);
  await expect(page.locator('.hop-table tr[data-ttl="2"]')).toHaveClass(/selected/);
  await expectResultSelectedRouteNode(page, "route-node-1-2");
  await page.locator('.hop-table tr[data-ttl="5"]').click();
  await expect(page.locator('.hop-table tr[data-ttl="1"]')).not.toHaveClass(/selected/);
  await expect(page.locator('.hop-table tr[data-ttl="5"]')).toHaveClass(/selected/);
  await expectResultSelectedRouteNode(page, "route-node-5");
  await expectNoPageOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("result route map normalizes antimeridian paths", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page, { traceResponse: antimeridianTraceResult() });

  await page.goto("/?measurement=m-smoke");

  await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
  await expect(page.getByLabel("trace result map")).toBeVisible();
  await expectMapCanvasPainted(page);
  await expectResultRouteData(page, { labels: ["1", "2", "4-5"], lineLength: 3, maxLineLngSpan: 3, maxFitLngSpan: 3 });
  await expectNoPageOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("mobile advanced panel and Turnstile widget stay in normal flow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page, { turnstileSiteKey: "site-key" });

  await page.goto("/");

  await expect(page.getByText("Turnstile 已配置")).toBeVisible();
  await expect(page.locator(".mock-turnstile-widget")).toBeVisible();
  await page.getByText("高级参数与精确筛选").click();
  await page.getByLabel("ASN").fill("7922");
  await page.getByLabel("network").fill("Comcast");
  await expect(page.getByLabel("ASN")).toHaveValue("7922");
  await expect(page.getByLabel("network")).toHaveValue("Comcast");
  await expect(page.getByLabel("tag")).toBeVisible();
  await expect(page.getByLabel("magic string")).toBeVisible();
  await expect(page.getByLabel("Globalping Token")).toBeVisible();

  await expectNoPageOverflow(page);
  await expectTurnstileStaysInFilterFlow(page);
  expect(consoleErrors).toEqual([]);
});

test("forced Liquid Glass fallback remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page);

  await page.goto("/?forceGlassFallback=1");

  await expect(page.locator("html.liquid-glass-force-fallback")).toHaveCount(1);
  await expect(page.locator('[data-liquid-glass][data-liquid-glass-mode="fallback"]').first()).toBeVisible();
  await expect(page.getByRole("button", { name: "开始网络路径诊断" })).toBeVisible();

  await page.getByRole("button", { name: "开始网络路径诊断" }).click();
  await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
  expect(consoleErrors).toEqual([]);

  await page.screenshot({
    path: `/tmp/${screenshotPrefix}-fallback-390x844.png`,
    fullPage: true,
  });
});

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

interface MockHandles {
  styleRequests: () => number;
}

interface MockOptions {
  expectedIpVersion?: 4 | 6;
  turnstileSiteKey?: string;
  traceResponse?: TraceResultResponse;
  beforeMeasurementResponse?: () => Promise<void>;
}

async function installMocks(page: Page, options: MockOptions = {}): Promise<MockHandles> {
  let pollCount = 0;
  let styleRequests = 0;
  let enriched = false;
  if (options.turnstileSiteKey) {
    await page.addInitScript(() => {
      window.turnstile = {
        render: (element, renderOptions) => {
          const widget = document.createElement("div");
          widget.className = "mock-turnstile-widget";
          widget.style.width = "300px";
          widget.style.height = "65px";
          widget.style.background = "#2f2f2f";
          element.appendChild(widget);
          window.setTimeout(() => renderOptions.callback("mock-turnstile-token"), 0);
          return "mock-widget-id";
        },
        reset: () => undefined,
      };
    });
    await page.route("**/turnstile/v0/api.js**", async (route) => {
      await route.fulfill({ contentType: "application/javascript", body: "" });
    });
  }
  await page.route("**/mock-style.json", async (route) => {
    styleRequests += 1;
    await route.fulfill({
      json: {
        version: 8,
        glyphs: "/mock-glyphs/{fontstack}/{range}.pbf",
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": "#edf0f2" } }],
      },
    });
  });
  await page.route("**/mock-glyphs/**", async (route) => {
    await route.fulfill({ contentType: "application/x-protobuf", body: Buffer.alloc(0) });
  });
  await page.route("**/api/config", async (route) => {
    await route.fulfill({ json: { turnstileSiteKey: options.turnstileSiteKey || "", mapStyleUrl: "/mock-style.json" } });
  });
  await page.route("**/api/probes", async (route) => {
    await route.fulfill({ json: { probes, fetchedAt: "2026-06-09T00:00:00.000Z" } });
  });
  await page.route("https://api.globalping.io/v1/limits", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 200, headers: globalpingCorsHeaders });
      return;
    }
    await route.fulfill({ headers: globalpingCorsHeaders, json: { rateLimit: limits } });
  });
  await page.route("https://api.globalping.io/v1/measurements", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 200, headers: globalpingCorsHeaders });
      return;
    }
    const body = (await route.request().postDataJSON()) as GlobalpingMeasurementRequest;
    validateTraceRequest(body, options.expectedIpVersion);
    await route.fulfill({ status: 202, headers: globalpingCorsHeaders, json: { id: "m-smoke", probesCount: 1 } });
  });
  await page.route("https://api.globalping.io/v1/measurements/m-smoke", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 200, headers: globalpingCorsHeaders });
      return;
    }
    await options.beforeMeasurementResponse?.();
    pollCount += 1;
    const status = pollCount === 1 ? "in-progress" : "finished";
    await route.fulfill({ headers: globalpingCorsHeaders, json: globalpingMeasurement(status) });
  });
  await page.route("**/api/trace/m-smoke", async (route) => {
    if (options.traceResponse || enriched) {
      await route.fulfill({ json: options.traceResponse || traceResult("finished") });
      return;
    }
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/trace/enrich", async (route) => {
    enriched = true;
    await route.fulfill({ json: options.traceResponse || traceResult("finished") });
  });
  return {
    styleRequests: () => styleRequests,
  };
}

interface GlobalpingMeasurementRequest {
  locations?: Array<{ magic?: string }>;
  measurementOptions?: { ipVersion?: 4 | 6 };
}

function validateTraceRequest(body: GlobalpingMeasurementRequest, expectedIpVersion?: 4 | 6): void {
  if (expectedIpVersion === undefined) {
    expect(body.measurementOptions).not.toHaveProperty("ipVersion");
  } else {
    expect(body.measurementOptions?.ipVersion).toBe(expectedIpVersion);
  }
  const magic = (body.locations || []).map((location) => location.magic || "").join(",");
  if (!magic) return;

  const locations = magic.split(",").map((item) => item.trim()).filter(Boolean);
  expect(locations.length).toBeLessThanOrEqual(10);
  expect(magic).not.toContain("Comcast");
  expect(magic).not.toContain("Hetzner Online");
  expect(magic).not.toContain("ExampleNet");
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    documentClient: document.documentElement.clientWidth,
    documentScroll: document.documentElement.scrollWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  expect(widths.documentScroll).toBeLessThanOrEqual(widths.documentClient);
  expect(widths.bodyScroll).toBeLessThanOrEqual(widths.bodyClient);
}

async function expectNoMapJavaScriptLoaded(page: Page): Promise<void> {
  const scripts = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming && entry.initiatorType === "script")
      .map((entry) => entry.name),
  );
  expect(scripts.filter((name) => !/\.css(?:\?|$)/.test(name) && /maplibre|ProbeMap|ResultsView/.test(name))).toEqual([]);
}

async function expectFilterSummaryConstrainsLongChips(page: Page): Promise<void> {
  const state = await page.getByTestId("filter-chips").evaluate((node) => {
    const chips = node as HTMLElement;
    const panel = document.querySelector(".filter-panel") as HTMLElement | null;
    const footer = document.querySelector(".filter-panel-footer") as HTMLElement | null;
    const runButton = document.querySelector('[aria-label="开始网络路径诊断"]') as HTMLElement | null;
    const chipsStyle = window.getComputedStyle(chips);
    const panelRect = panel?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const buttonRect = runButton?.getBoundingClientRect();
    return {
      chipsClientHeight: chips.clientHeight,
      chipsScrollHeight: chips.scrollHeight,
      chipsOverflowY: chipsStyle.overflowY,
      chipsScrollbarWidth: chipsStyle.scrollbarWidth,
      footerBottom: footerRect?.bottom ?? 0,
      panelBottom: panelRect?.bottom ?? 0,
      runButtonBottom: buttonRect?.bottom ?? 0,
      viewportHeight: window.innerHeight,
    };
  });
  expect(["auto", "scroll"]).toContain(state.chipsOverflowY);
  expect(state.chipsScrollbarWidth).toBe("none");
  expect(state.chipsClientHeight).toBeLessThanOrEqual(170);
  expect(state.chipsScrollHeight).toBeGreaterThan(state.chipsClientHeight);
  expect(state.footerBottom).toBeLessThanOrEqual(Math.min(state.panelBottom, state.viewportHeight));
  expect(state.runButtonBottom).toBeLessThanOrEqual(state.viewportHeight);
}

async function expectLightModePanelBoundaries(page: Page): Promise<void> {
  const state = await page.locator(".filter-panel").evaluate((node) => {
    const rootStyles = window.getComputedStyle(document.documentElement);
    const panelStyles = window.getComputedStyle(node);
    return {
      glassBorder: rootStyles.getPropertyValue("--glass-border").trim(),
      mutedBorder: rootStyles.getPropertyValue("--muted-border").trim(),
      tableBorder: rootStyles.getPropertyValue("--table-border").trim(),
      panelBorderColor: panelStyles.borderColor,
      panelBorderWidth: panelStyles.borderTopWidth,
    };
  });
  expect(state.glassBorder).toBe("rgba(38, 54, 50, 0.2)");
  expect(state.mutedBorder).toBe("rgba(52, 65, 62, 0.16)");
  expect(state.tableBorder).toBe("rgba(41, 56, 52, 0.16)");
  expect(state.panelBorderColor).not.toBe("rgba(255, 255, 255, 0.62)");
  expect(state.panelBorderWidth).toBe("1px");
}

async function expectDarkMapControls(page: Page): Promise<void> {
  await expect(page.locator(".tool-button").first()).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-group button").first()).toBeVisible();
  await expect
    .poll(async () => page.locator(".tool-button").first().evaluate((node) => window.getComputedStyle(node).backgroundColor))
    .toBe("rgba(18, 26, 27, 0.88)");
  const state = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = window.getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        color: style.color,
        filter: style.filter,
      };
    };
    const root = window.getComputedStyle(document.documentElement);
    return {
      controlBg: root.getPropertyValue("--map-control-bg").trim(),
      controlFg: root.getPropertyValue("--map-control-fg").trim(),
      controlBorder: root.getPropertyValue("--map-control-border").trim(),
      toolbar: read(".tool-button"),
      zoomGroup: read(".maplibregl-ctrl-group"),
      zoomIcon: read(".maplibregl-ctrl-group button .maplibregl-ctrl-icon"),
      attribution: read(".maplibregl-ctrl-attrib"),
      attributionButton: read(".maplibregl-ctrl-attrib-button"),
    };
  });
  expect(state.controlBg).toBe("rgba(18, 26, 27, 0.88)");
  expect(state.controlFg).toBe("rgba(243, 247, 245, 0.9)");
  expect(state.controlBorder).toBe("rgba(255, 255, 255, 0.2)");
  expect(state.toolbar?.backgroundColor).toBe(state.controlBg);
  expect(state.toolbar?.color).toBe(state.controlFg);
  expect(state.zoomGroup?.backgroundColor).toBe(state.controlBg);
  expect(state.zoomGroup?.borderColor).toBe(state.controlBorder);
  expect(state.zoomIcon?.filter).not.toBe("none");
  expect(state.attribution?.backgroundColor).toBe(state.controlBg);
  expect(state.attribution?.borderColor).toBe(state.controlBorder);
  expect(state.attributionButton?.backgroundColor).toBe(state.controlBg);
}

async function expectTurnstileStaysInFilterFlow(page: Page): Promise<void> {
  const state = await page.evaluate(() => {
    const panel = document.querySelector(".filter-panel")?.getBoundingClientRect();
    const box = document.querySelector(".turnstile-box")?.getBoundingClientRect();
    const shell = document.querySelector(".turnstile-widget-shell")?.getBoundingClientRect();
    const widget = document.querySelector(".mock-turnstile-widget")?.getBoundingClientRect();
    const attribution = document.querySelector(".filter-panel .attribution-panel")?.getBoundingClientRect();
    return {
      panelWidth: panel?.width ?? 0,
      shellWidth: shell?.width ?? 0,
      widgetWidth: widget?.width ?? 0,
      shellLeft: shell?.left ?? 0,
      shellRight: shell?.right ?? 0,
      panelLeft: panel?.left ?? 0,
      panelRight: panel?.right ?? 0,
      turnstileBottom: box?.bottom ?? 0,
      attributionTop: attribution?.top ?? 0,
    };
  });
  expect(state.shellWidth).toBeGreaterThan(0);
  expect(state.widgetWidth).toBeLessThanOrEqual(300);
  expect(state.shellWidth).toBeLessThanOrEqual(state.panelWidth);
  expect(state.shellLeft).toBeGreaterThanOrEqual(state.panelLeft);
  expect(state.shellRight).toBeLessThanOrEqual(state.panelRight);
  expect(state.attributionTop).toBeGreaterThanOrEqual(state.turnstileBottom);
}

async function expectMapCanvasPainted(page: Page): Promise<void> {
  const canvas = page.locator(".maplibregl-canvas").first();
  await expect(canvas).toBeVisible();
  const state = await canvas.evaluate((node) => {
    const item = node as HTMLCanvasElement;
    const rect = item.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      dataUrlLength: item.toDataURL("image/png").length,
    };
  });
  expect(state.width).toBeGreaterThan(250);
  expect(state.height).toBeGreaterThan(250);
  expect(state.dataUrlLength).toBeGreaterThan(1000);
}

async function expectHopTableScrollsWithinPanel(page: Page): Promise<void> {
  const state = await page.locator(".hop-table-scroll").evaluate((node) => {
    const item = node as HTMLElement;
    return {
      overflowX: window.getComputedStyle(item).overflowX,
      clientWidth: item.clientWidth,
      scrollWidth: item.scrollWidth,
      documentScroll: document.documentElement.scrollWidth,
      documentClient: document.documentElement.clientWidth,
    };
  });
  expect(["auto", "scroll"]).toContain(state.overflowX);
  expect(state.scrollWidth).toBeGreaterThanOrEqual(state.clientWidth);
  expect(state.documentScroll).toBeLessThanOrEqual(state.documentClient);
}

async function expectHopTableColumns(page: Page): Promise<void> {
  const headers = await page.locator(".hop-table th").allInnerTexts();
  expect(headers).toEqual(["TTL", "IP / hostname", "loss", "avg", "min", "max", "ASN", "region", "owner / ISP"]);
}

async function expectMapContainsCoordinate(page: Page, coordinate: [number, number]): Promise<void> {
  await expect
    .poll(async () => {
      const state = await page.locator(".map-container").evaluate((node, nextCoordinate) => {
        const map = (node as HTMLElement & { __globalTraceMap?: DebugMap }).__globalTraceMap;
        return Boolean(map?.getBounds().contains(nextCoordinate as [number, number]));
      }, coordinate);
      return state;
    })
    .toBe(true);
}

async function expectResultMapContainsCoordinate(page: Page, coordinate: [number, number]): Promise<void> {
  await expect
    .poll(async () => {
      const state = await page.locator(".result-map").evaluate((node, nextCoordinate) => {
        const map = (node as HTMLElement & { __globalTraceResultMap?: DebugMap }).__globalTraceResultMap;
        return Boolean(map?.getBounds().contains(nextCoordinate as [number, number]));
      }, coordinate);
      return state;
    })
    .toBe(true);
}

async function expectResultMapStyleLoaded(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      return page.locator(".result-map").evaluate((node) => {
        const map = (node as HTMLElement & { __globalTraceResultMap?: DebugMap }).__globalTraceResultMap;
        return Boolean(map && (typeof map.loaded !== "function" || map.loaded()));
      });
    })
    .toBe(true);
}

async function expectResultRouteData(
  page: Page,
  expected: { labels: string[]; lineLength: number; maxLineLngSpan: number; maxFitLngSpan?: number },
): Promise<void> {
  await expect
    .poll(async () => resultRouteState(page))
    .toMatchObject({
      labels: expected.labels,
      lineLength: expected.lineLength,
    });

  const state = await resultRouteState(page);
  expect(state.lineLngSpan).toBeLessThan(expected.maxLineLngSpan);
  if (expected.maxFitLngSpan !== undefined) {
    expect(state.fitLngSpan).toBeLessThan(expected.maxFitLngSpan);
  }
}

async function resultRouteState(page: Page): Promise<{ labels: string[]; lineLength: number; lineLngSpan: number; fitLngSpan: number }> {
  return page.locator(".result-map").evaluate((node) => {
    const data = (
      node as HTMLElement & {
        __globalTraceResultData?: {
          featureCollection?: { features?: Array<{ geometry?: { coordinates?: number[][] }; properties?: Record<string, unknown> }> };
          fitCoordinates?: number[][];
        };
      }
    ).__globalTraceResultData;
    const features = data?.featureCollection?.features || [];
    const line = features.find((feature) => feature.properties?.kind === "path")?.geometry?.coordinates || [];
    const labels = features
      .filter((feature) => feature.properties?.kind === "hop")
      .map((feature) => String(feature.properties?.label));
    const span = (coordinates: number[][]) => {
      const lngs = coordinates.map((coordinate) => coordinate[0]);
      return lngs.length ? Math.max(...lngs) - Math.min(...lngs) : 0;
    };
    return {
      labels,
      lineLength: line.length,
      lineLngSpan: span(line),
      fitLngSpan: span(data?.fitCoordinates || []),
    };
  });
}

async function expectResultSelectedRouteNode(page: Page, nodeId: string): Promise<void> {
  await expect
    .poll(async () =>
      page.locator(".result-map").evaluate((node) => {
        return (node as HTMLElement & { __globalTraceSelectedRouteNodeId?: string | null }).__globalTraceSelectedRouteNodeId || null;
      }),
    )
    .toBe(nodeId);
}

async function expectMapProjectsCoordinateInsideCanvas(page: Page, coordinate: [number, number]): Promise<void> {
  await expect
    .poll(async () => {
      return page.locator(".map-container").evaluate((node, nextCoordinate) => {
        const map = (node as HTMLElement & { __globalTraceMap?: DebugMap }).__globalTraceMap;
        if (!map) return false;
        const rect = map.getCanvas().getBoundingClientRect();
        const [lng, lat] = nextCoordinate as [number, number];
        return [lng - 360, lng, lng + 360]
          .map((nextLng) => map.project([nextLng, lat]))
          .some((point) => point.x >= 0 && point.x <= rect.width && point.y >= 0 && point.y <= rect.height);
      }, coordinate);
    })
    .toBe(true);
}

async function clickResultMapRouteNode(page: Page, nodeId: string): Promise<void> {
  const canvas = page.locator(".result-map .maplibregl-canvas");
  await canvas.scrollIntoViewIfNeeded();
  let point: { x: number; y: number } | null = null;
  await expect
    .poll(async () => {
      point = await resultMapRouteNodeCanvasPoint(page, nodeId);
      return Boolean(point);
    })
    .toBe(true);
  if (!point) throw new Error(`route node ${nodeId} is not clickable`);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("result map canvas is not visible");
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

async function clickMapCoordinate(page: Page, coordinate: [number, number]): Promise<void> {
  const point = await mapScreenPoint(page, coordinate);
  await page.mouse.click(point.x, point.y);
}

async function resultMapRouteNodeCanvasPoint(page: Page, nodeId: string): Promise<{ x: number; y: number } | null> {
  return page.locator(".result-map").evaluate((node, nextNodeId) => {
    const map = (node as HTMLElement & { __globalTraceResultMap?: DebugMap }).__globalTraceResultMap;
    const data = (
      node as HTMLElement & {
        __globalTraceResultData?: { routeNodes?: Array<{ nodeId?: string; coordinate?: [number, number] }> };
      }
    ).__globalTraceResultData;
    if (!map) return null;
    const routeNode = data?.routeNodes?.find((item) => item.nodeId === nextNodeId);
    const coordinate = routeNode?.coordinate;
    if (!coordinate) return null;
    const rect = map.getCanvas().getBoundingClientRect();
    const [lng, lat] = coordinate;
    const projections = [lng - 360, lng, lng + 360].map((nextLng) => map.project([nextLng, lat]));
    const offsets = [
      [0, 0],
      [-8, 0],
      [8, 0],
      [0, -8],
      [0, 8],
      [-8, -8],
      [8, -8],
      [-8, 8],
      [8, 8],
    ];
    for (const projected of projections) {
      if (projected.x < 0 || projected.x > rect.width || projected.y < 0 || projected.y > rect.height) continue;
      for (const [xOffset, yOffset] of offsets) {
        const point = { x: projected.x + xOffset, y: projected.y + yOffset };
        if (point.x < 0 || point.x > rect.width || point.y < 0 || point.y > rect.height) continue;
        const features = map.queryRenderedFeatures?.([point.x, point.y], { layers: ["result-points", "result-hop-labels"] }) || [];
        if (features.some((feature) => feature.properties?.nodeId === nextNodeId)) {
          return point;
        }
      }
    }
    return null;
  }, nodeId);
}

async function boxSelectLosAngelesWithOutsideRelease(page: Page): Promise<void> {
  await expectMapContainsCoordinate(page, [-118.24, 34.05]);
  await expectMapProjectsCoordinateInsideCanvas(page, [-118.24, 34.05]);
  await page.waitForTimeout(500);
  const result = await page.locator(".map-container").evaluate((node, nextProbes) => {
    const map = (node as HTMLElement & { __globalTraceMap?: DebugMap }).__globalTraceMap;
    if (!map) return null;
    const target = [-118.24, 34.05] as [number, number];
    const canvas = map.getCanvas().getBoundingClientRect();
    const [targetLng, targetLat] = target;
    const targetProjections = [targetLng - 360, targetLng, targetLng + 360].map((lng) => map.project([lng, targetLat]));
    const projected =
      targetProjections.find((point) => point.x >= 0 && point.x <= canvas.width && point.y >= 0 && point.y <= canvas.height) ??
      targetProjections.sort((a, b) => Math.abs(a.x - canvas.width / 2) - Math.abs(b.x - canvas.width / 2))[0];
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const debug: unknown[] = [];
    for (const size of [32, 48, 72, 96, 132, 180]) {
      const start = {
        x: clamp(projected.x - size, 0, canvas.width),
        y: clamp(projected.y + size, 0, canvas.height),
      };
      const end = {
        x: clamp(projected.x + size, 0, canvas.width),
        y: 0,
      };
      const minX = Math.min(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxX = Math.max(start.x, end.x);
      const maxY = Math.max(start.y, end.y);
      const centerX = (minX + maxX) / 2;
      const selected = (nextProbes as GlobalpingProbe[]).filter((probe) => {
        const { longitude, latitude } = probe.location;
        const point = [longitude - 360, longitude, longitude + 360]
          .map((lng) => map.project([lng, latitude]))
          .sort((a, b) => Math.abs(a.x - centerX) - Math.abs(b.x - centerX))[0];
        return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
      });
      debug.push({ size, start, end, selected: selected.map((probe) => probe.location.city) });
      if (selected.length === 1 && selected[0]?.location.city === "Los Angeles") {
        return {
          drag: {
            startX: canvas.left + start.x,
            startY: canvas.top + start.y,
            endX: canvas.left + end.x,
            endY: canvas.top - 40,
          },
          debug,
        };
      }
    }
    return { drag: null, debug };
  }, probes);
  if (!result?.drag) {
    throw new Error(`could not derive a one-probe box selection rectangle: ${JSON.stringify(result?.debug)}`);
  }
  const drag = result.drag;
  await page.getByRole("button", { name: "框选" }).click();
  await page.mouse.move(drag.startX, drag.startY);
  await page.mouse.down();
  await page.mouse.move(drag.endX, drag.endY, { steps: 6 });
  await page.mouse.up();
  const lastBox = await page.locator(".maplibregl-canvas").first().evaluate((node) => {
    return (node as HTMLCanvasElement & { __globalTraceLastBox?: unknown }).__globalTraceLastBox ?? null;
  });
  const selected = (lastBox as { selected?: string[] } | null)?.selected ?? [];
  if (selected.length !== 1 || selected[0] !== "Los Angeles") {
    throw new Error(`box selection did not select Los Angeles: ${JSON.stringify(lastBox)}`);
  }
}

async function mapScreenPoint(page: Page, coordinate: [number, number]): Promise<{ x: number; y: number }> {
  const point = await page.locator(".map-container").evaluate((node, nextCoordinate) => {
    const map = (node as HTMLElement & { __globalTraceMap?: DebugMap }).__globalTraceMap;
    if (!map) return null;
    const rect = map.getCanvas().getBoundingClientRect();
    const [lng, lat] = nextCoordinate as [number, number];
    const projections = [lng - 360, lng, lng + 360].map((nextLng) => map.project([nextLng, lat]));
    const projected =
      projections.find((candidate) => candidate.x >= 0 && candidate.x <= rect.width && candidate.y >= 0 && candidate.y <= rect.height) ??
      projections.sort((a, b) => Math.abs(a.x - rect.width / 2) - Math.abs(b.x - rect.width / 2))[0];
    return { x: rect.left + projected.x, y: rect.top + projected.y };
  }, coordinate);
  if (!point) throw new Error("map debug handle is not available");
  return point;
}

interface DebugMap {
  getBounds: () => { contains: (coordinate: [number, number]) => boolean };
  getCanvas: () => HTMLElement;
  loaded?: () => boolean;
  project: (coordinate: [number, number]) => { x: number; y: number };
  queryRenderedFeatures?: (
    geometry: [[number, number], [number, number]],
    options: { layers: string[] },
  ) => Array<{ properties?: Record<string, unknown> }>;
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
  {
    location: {
      continent: "EU",
      region: "Western Europe",
      country: "DE",
      state: null,
      city: "Falkenstein",
      asn: 24940,
      latitude: 50.48,
      longitude: 12.37,
      network: "Hetzner Online",
    },
    tags: ["datacenter-network"],
    resolvers: [],
  },
  {
    location: {
      continent: "AS",
      region: "Eastern Asia",
      country: "JP",
      state: null,
      city: "Tokyo",
      asn: 64500,
      latitude: 35.68,
      longitude: 139.76,
      network: "ExampleNet",
    },
    tags: ["datacenter-network"],
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

function globalpingMeasurement(status: "in-progress" | "finished") {
  return {
    id: "m-smoke",
    type: "mtr",
    target: "globalping.io",
    status,
    probesCount: 1,
    results: [],
  };
}

function traceResult(status: TraceResultResponse["status"]): TraceResultResponse {
  return {
    measurementId: "m-smoke",
    type: "mtr",
    target: "globalping.io",
    status,
    probesCount: 1,
    results:
      status === "in-progress"
        ? []
        : [
            {
              id: "probe-1",
              probe: {
                continent: "NA",
                region: "Northern America",
                country: "US",
                state: "CA",
                city: "Los Angeles",
                asn: 7922,
                latitude: 34.05,
                longitude: -118.24,
                network: "Comcast",
                tags: ["eyeball-network"],
                resolvers: [],
              },
              status: "finished",
              resolvedAddress: "8.8.8.8",
              resolvedHostname: "dns.google",
              rawOutput: "Host Loss% Avg",
              hops: [
                {
                  ttl: 1,
                  ip: "8.8.8.8",
                  hostname: "dns.google",
                  asn: [15169],
                  timingsMs: [1.2],
                  stats: { min: 1, avg: 1.2, max: 2, total: 1, rcv: 1, drop: 0, loss: 0 },
                  geo: {
                    ip: "8.8.8.8",
                    asnumber: "AS15169",
                    owner: "Google LLC",
                    isp: "Google",
                    country_en: "United States",
                    prov_en: "California",
                    city_en: "Mountain View",
                    whois: "google-whois",
                    lat: 37.39,
                    lng: -122.08,
                    prefix: "8.8.8.0/24",
                    source: "mock",
                  },
                },
              ],
            },
          ],
    enrichment: { status: status === "finished" ? "complete" : "skipped", cached: 0, fetched: status === "finished" ? 1 : 0, errors: [] },
  };
}

function routeQualityTraceResult(): TraceResultResponse {
  const result = traceResult("finished");
  const active = result.results[0];
  if (!active) return result;
  active.hops = [
    traceHop(1, "203.0.113.1", 37.39, -122.08, {
      country_en: "United States",
      prov_en: "California",
      city_en: "Mountain View",
    }),
    traceHop(2, "203.0.113.2", 37.39, -122.08, {
      country_en: "United States",
      prov_en: "California",
      city_en: "Mountain View",
    }),
    traceHop(3, "203.0.113.3", 0, 0, {
      country_en: "United States",
      prov_en: "California",
      city_en: "Null Island",
    }),
    traceHop(4, "203.0.113.4", 39, -98, {
      country_en: "United States",
      prov_en: "",
      city_en: "",
    }),
    traceHop(5, "203.0.113.5", 51.5, -0.12, {
      country_en: "United Kingdom",
      city_en: "London",
    }),
  ];
  return result;
}

function antimeridianTraceResult(): TraceResultResponse {
  const result = traceResult("finished");
  const active = result.results[0];
  if (!active) return result;
  active.probe = {
    ...active.probe,
    city: "Apia",
    latitude: 10.5,
    longitude: -179.4,
  };
  active.hops = [
    traceHop(1, "203.0.113.11", 10, 179.4, { country_en: "Fiji", city_en: "East" }),
    traceHop(2, "203.0.113.12", 11, -179.3, { country_en: "Fiji", city_en: "West" }),
    traceHop(3, "203.0.113.13", 0, 0, { country_en: "Fiji", city_en: "Invalid" }),
    traceHop(4, "203.0.113.14", 12, -178.9, { country_en: "Fiji", city_en: "West 2" }),
    traceHop(5, "203.0.113.15", 12, -178.9, { country_en: "Fiji", city_en: "West 2" }),
  ];
  return result;
}

function traceHop(
  ttl: number,
  ip: string,
  lat: number,
  lng: number,
  geo: Partial<NonNullable<TraceResultResponse["results"][number]["hops"][number]["geo"]>> = {},
): TraceResultResponse["results"][number]["hops"][number] {
  return {
    ttl,
    ip,
    hostname: ip,
    asn: [64500],
    timingsMs: [ttl],
    stats: { min: ttl, avg: ttl, max: ttl, total: 1, rcv: 1, drop: 0, loss: 0 },
    geo: {
      ip,
      asnumber: "AS64500",
      lat,
      lng,
      source: "mock",
      ...geo,
    },
  };
}
