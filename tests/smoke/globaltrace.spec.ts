import { expect, test, type Locator, type Page } from "@playwright/test";
import type { GlobalpingLimitResponse, GlobalpingProbe, TraceResultResponse } from "../../src/shared/types";

const screenshotPrefix = process.env.GLOBALTRACE_SCREENSHOT_PREFIX || "globaltrace-liquid-glass";

const viewports = [
  { name: "1440x1000", width: 1440, height: 1000 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
];

const mobileResultViewports = [
  { name: "320x568", width: 320, height: 568 },
  { name: "360x740", width: 360, height: 740 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "844x390", width: 844, height: 390 },
];

for (const viewport of viewports) {
  test(`deterministic trace flow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const consoleErrors = collectConsoleErrors(page);
    const mocks = await installMocks(page, { expectedIpVersion: 6 });

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "GlobalTrace" })).toBeVisible();
    await expect(page.getByText("Globalping x NextTrace 的全球路由追踪")).toBeVisible();
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
    const magicInput = page.getByLabel("magic string");
    await expect(magicInput).toHaveValue("");
    await magicInput.click();
    const magicSuggestions = page.getByRole("listbox", { name: "候选列表" });
    await expect(magicSuggestions.getByRole("option", { name: "Los Angeles+US+AS7922+eyeball-network" })).toBeVisible();
    await expect(magicSuggestions.getByRole("option", { name: "Falkenstein+DE+AS24940+datacenter-network" })).toBeVisible();
    await expectSuggestionPopoverOnTop(magicSuggestions);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "切换到 3D 视图" })).toHaveCount(0);
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await expectDarkMapControls(page);
    if (viewport.name === "1440x1000" || viewport.name === "390x844") {
      await page.screenshot({
        path: `/tmp/${screenshotPrefix}-dark-home-${viewport.name}.png`,
        fullPage: true,
      });
    }
    await expect(page.locator("[data-liquid-glass]").first()).toBeVisible();
    await expect(page.locator("[data-liquid-glass]").first()).toHaveAttribute("data-liquid-glass-mode", /^(liquid|fallback)$/);
    await expect.poll(mocks.styleRequests).toBe(1);
    await expect(page.getByLabel("IP 版本")).toHaveValue("");
    await page.getByLabel("IP 版本").selectOption("6");
    await expect(page.getByLabel("IP 版本")).toHaveValue("6");

    await page.getByText("高级参数与精确筛选").click();
    await page.getByLabel("国家/地区").fill("US");
    await expect(page.getByText("1 / 3 probes 匹配")).toBeVisible();
    await expect(page.locator("datalist")).toHaveCount(0);
    await page.getByLabel("network").click();
    const networkSuggestions = page.getByRole("listbox", { name: "候选列表" });
    await expect(networkSuggestions.getByRole("option", { name: "Comcast" })).toBeVisible();
    await expect(networkSuggestions.getByRole("option", { name: "Hetzner Online" })).toHaveCount(0);
    await expect(networkSuggestions.getByRole("option", { name: "ExampleNet" })).toHaveCount(0);
    await expectSuggestionPopoverOnTop(networkSuggestions);
    await expectSuggestionPopoverReadable(networkSuggestions);
    await page.keyboard.press("Escape");
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
    await expectVisibleHopText(page, "AS15169");
    await expectVisibleHopText(page, "Google LLC / Google");
    await expectHopTableColumns(page);
    if (viewport.name === "1440x1000") {
      await expectPeerAsHopLink(page);
    }
    await expect(page.getByLabel("trace result map")).toBeVisible();
    await expectMapCanvasPainted(page);
    await expectResultMapProjection(page, "mercator");
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

for (const viewport of [
  { name: "1440x1000", width: 1440, height: 1000 },
  { name: "390x844", width: 390, height: 844 },
]) {
  test(`result map 2D and 3D switch at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const consoleErrors = collectConsoleErrors(page);
    await installMocks(page);

    await page.goto("/");

    await expect(page.getByLabel("probe map")).toBeVisible();
    await expect(page.getByLabel("probe map").getByText("3 / 3 probes", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "框选" })).toBeVisible();
    await expect(page.getByRole("button", { name: "切换到 3D 视图" })).toHaveCount(0);
    await expectMapCanvasPainted(page);
    await expectProbeMapProjection(page, "mercator");
    await expectNoPageOverflow(page);

    await page.getByRole("button", { name: "开始网络路径诊断" }).click();

    await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
    await expect(page.getByRole("group", { name: "结果地图视图" })).toBeVisible();
    await expectResultHeaderActions(page);
    await expect(page.getByRole("button", { name: "切换结果地图到 2D" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("tab", { name: /Los Angeles/ })).toHaveAttribute("aria-selected", "true");
    await expectHopTableColumns(page);
    await expectVisibleHopText(page, "8.8.8.8");
    await expect(page.getByLabel("trace result map")).toBeVisible();
    await expectMapCanvasPainted(page);
    await expectResultMapProjection(page, "mercator");

    await page.getByRole("button", { name: "切换结果地图到 3D" }).click();

    await expectResultMapProjection(page, "globe");
    await expect(page.getByRole("button", { name: "切换结果地图到 3D" })).toHaveAttribute("aria-pressed", "true");
    await expectResultMapHasCountryLabelStyle(page);
    await expectResultMapGlobeLineStyle(page);
    if (viewport.name === "1440x1000") {
      await expectResultMapGlobeDesktopSize(page);
    }
    await expectResultMapStyleLoaded(page);
    await expectResultMapContainsCoordinate(page, [-118.24, 34.05]);
    await expectResultMapContainsCoordinate(page, [-122.08, 37.39]);
    await page.getByText("raw output").click();
    await page.getByText("whois / source details").click();
    await expect(page.getByText("Host Loss% Avg")).toBeVisible();
    if (viewport.name === "390x844") {
      await expectMobileResultLayout(page);
    }

    await page.getByRole("button", { name: "关闭结果" }).click();
    await expect(page.getByLabel("probe map")).toBeVisible();
    await expect(page.getByRole("button", { name: "框选" })).toBeVisible();
    await expect(page.getByRole("group", { name: "结果地图视图" })).toHaveCount(0);
    await expectProbeMapProjection(page, "mercator");
    await expect(page.getByRole("button", { name: "查看结果" })).toBeVisible();
    await page.getByRole("button", { name: "查看结果" }).click();
    await expectVisibleHopText(page, "8.8.8.8");
    await expectResultMapProjection(page, "globe");

    await expect(page).toHaveURL(/measurement=m-smoke/);
    await expect(page).not.toHaveURL(/view=/);
    await expectNoPageOverflow(page);
    expect(consoleErrors).toEqual([]);

    await page.screenshot({
      path: `/tmp/${screenshotPrefix}-result-map-switch-${viewport.name}.png`,
      fullPage: true,
    });
  });
}

for (const viewport of mobileResultViewports) {
  test(`mobile result page controls stay inside layout at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const consoleErrors = collectConsoleErrors(page);
    await installMocks(page);

    await page.goto("/?measurement=m-smoke");

    await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
    await expect(page.getByRole("group", { name: "结果地图视图" })).toBeVisible();
    await expectResultHeaderActions(page);
    await expect(page.getByRole("button", { name: "切换结果地图到 2D" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "复制" })).toBeVisible();
    await expect(page.getByRole("button", { name: "关闭结果" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Los Angeles/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("trace result map")).toBeVisible();
    await expectMapCanvasPainted(page);
    await expectResultMapProjection(page, "mercator");

    await page.getByRole("button", { name: "切换结果地图到 3D" }).click();

    await expectResultMapProjection(page, "globe");
    await expect(page.getByRole("button", { name: "切换结果地图到 3D" })).toHaveAttribute("aria-pressed", "true");
    await expectResultMapStyleLoaded(page);
    await page.getByText("raw output").click();
    await page.getByText("whois / source details").click();
    await expect(page.getByText("Host Loss% Avg")).toBeVisible();
    await expect(page.getByText(/google-whois/)).toBeVisible();
    await expectMobileResultLayout(page);
    await expectNoPageOverflow(page);
    expect(consoleErrors).toEqual([]);

    await page.screenshot({
      path: `/tmp/${screenshotPrefix}-mobile-result-${viewport.name}.png`,
      fullPage: true,
    });
  });
}

test("desktop filter summary constrains long magic content and keeps run controls visible", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "light" });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page, { turnstileSiteKey: "site-key", turnstileAutoToken: false });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "开始网络路径诊断" })).toBeVisible();
  await expect(page.locator(".mock-turnstile-widget")).toHaveCount(0);
  const longMagic = Array.from({ length: 20 }, (_, index) => `Novosibirsk-${index}+RU+AS${21000 + index}+datacenter-network`).join(
    ", ",
  );
  await page.getByLabel("magic string").fill(longMagic);

  await expect(page.getByTestId("filter-chips")).toContainText("Novosibirsk-0+RU+AS21000+datacenter-network");
  await expect(page.getByRole("button", { name: "开始网络路径诊断" })).toBeVisible();
  await expectFilterSummaryConstrainsLongChips(page);
  await page.getByRole("button", { name: "开始网络路径诊断" }).click();
  await expect(page.getByRole("dialog", { name: "验证后开始诊断" })).toBeVisible();
  await expect(page.locator(".mock-turnstile-widget")).toBeVisible();
  await expectTurnstileDialogCentered(page);
  await expectLightTurnstileDialogReadable(page);
  await expectNoPageOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("reversed magic expands probes and normalizes measurement locations", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleErrors = collectConsoleErrors(page);
  const mocks = await installMocks(page, { probes: makeChinaSmokeProbes(4) });

  await page.goto("/");

  await expect(page.getByText("4 / 4 probes 匹配")).toBeVisible();
  await expect(page.getByLabel("probes")).toHaveValue("3");
  await page.getByLabel("magic string").fill("AS4134+CN");
  await expect(page.getByText("4 / 4 probes 匹配")).toBeVisible();
  await expect(page.getByLabel("probes")).toHaveValue("4");
  const magicSuggestions = page.getByRole("listbox", { name: "候选列表" });
  await expect(magicSuggestions.getByRole("option", { name: "Shenzhen+CN+AS4134+eyeball-network" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "开始网络路径诊断" }).click();
  await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
  expect(mocks.traceRequests()[0]).toMatchObject({
    limit: 4,
    locations: [
      { magic: "Shenzhen+CN+AS4134+eyeball-network" },
      { magic: "Nanning+CN+AS4134+eyeball-network" },
      { magic: "Guangzhou+CN+AS4134+eyeball-network" },
      { magic: "Shenzhou+CN+AS4134+datacenter-network" },
    ],
  });
  expect(consoleErrors).toEqual([]);
});

test("structured filters expand probes after explicit user filtering", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page, { probes: [...makeChinaSmokeProbes(4), probes[0]] });

  await page.goto("/");

  await expect(page.getByText("5 / 5 probes 匹配")).toBeVisible();
  await expect(page.getByLabel("probes")).toHaveValue("3");
  await page.getByText("高级参数与精确筛选").click();
  await page.getByLabel("国家/地区").fill("CN");
  await expect(page.getByText("4 / 5 probes 匹配")).toBeVisible();
  await expect(page.getByLabel("probes")).toHaveValue("4");
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
  await page.screenshot({
    path: `/tmp/${screenshotPrefix}-about-390x844.png`,
    fullPage: true,
  });
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
  await expectResultRouteData(page, { labels: ["1-2", "5"], minLineLength: 3, maxLineLngSpan: 140 });
  await clickResultMapRouteNode(page, "route-0-node-1-2");
  await expect(page.locator('.hop-table tr[data-ttl="1"]')).toHaveClass(/selected/);
  await expect(page.locator('.hop-table tr[data-ttl="2"]')).toHaveClass(/selected/);
  await expectResultSelectedRouteNode(page, "route-0-node-1-2");
  await clickVisibleHop(page, 5);
  await expect(page.locator('.hop-table tr[data-ttl="1"]')).not.toHaveClass(/selected/);
  await expect(page.locator('.hop-table tr[data-ttl="5"]')).toHaveClass(/selected/);
  await expectResultSelectedRouteNode(page, "route-0-node-5");
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
  await expectResultRouteData(page, { labels: ["1", "2", "4-5"], minLineLength: 3, maxLineLngSpan: 3, maxFitLngSpan: 3 });
  await expectNoPageOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("mobile advanced panel opens Turnstile in a centered dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page, { turnstileSiteKey: "site-key", turnstileAutoToken: false });

  await page.goto("/");

  await expect(page.getByText("Turnstile 已配置")).toBeVisible();
  await expect(page.locator(".mock-turnstile-widget")).toHaveCount(0);
  await page.getByText("高级参数与精确筛选").click();
  await page.getByLabel("ASN").fill("7922");
  await page.getByLabel("network").fill("Comcast");
  await expect(page.getByLabel("ASN")).toHaveValue("7922");
  await expect(page.getByLabel("network")).toHaveValue("Comcast");
  await expect(page.getByLabel("tag")).toBeVisible();
  await expect(page.getByLabel("Globalping Token")).toBeVisible();

  await page.getByRole("button", { name: "开始网络路径诊断" }).click();
  await expect(page.getByRole("dialog", { name: "验证后开始诊断" })).toBeVisible();
  await expect(page.locator(".mock-turnstile-widget")).toBeVisible();
  await expectNoPageOverflow(page);
  await expectTurnstileDialogCentered(page);
  expect(consoleErrors).toEqual([]);
});

test("shared result opens Turnstile in a centered dialog before loading", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page, { turnstileSiteKey: "site-key", turnstileAutoToken: false });

  await page.goto("/?measurement=m-smoke");

  await expect(page.getByRole("dialog", { name: "验证后打开分享结果" })).toBeVisible();
  await expect(page.locator(".mock-turnstile-widget")).toBeVisible();
  await expect(page.getByText("finished · 1 probes · m-smoke")).toHaveCount(0);
  await expectTurnstileDialogCentered(page);

  await page.evaluate(() => {
    (window as unknown as { __issueMockTurnstile?: () => void }).__issueMockTurnstile?.();
  });

  await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "验证后打开分享结果" })).toHaveCount(0);
  await expectNoPageOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("cancelled shared Turnstile opens result with browser GeoIP fallback", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = collectConsoleErrors(page);
  const mocks = await installMocks(page, { turnstileSiteKey: "site-key", turnstileAutoToken: false });

  await page.goto("/?measurement=m-smoke");

  await expect(page.getByRole("dialog", { name: "验证后打开分享结果" })).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();

  await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
  await expectVisibleHopText(page, "AS15169");
  await expectVisibleHopText(page, "GOOGLE - Google LLC");
  await expect.poll(mocks.enrichRequests).toBe(0);
  await expect.poll(mocks.browserFallbackRequests).toBe(2);
  await expectNoPageOverflow(page);
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
  enrichRequests: () => number;
  browserFallbackRequests: () => number;
  traceRequests: () => GlobalpingMeasurementRequest[];
}

interface MockOptions {
  expectedIpVersion?: 4 | 6;
  turnstileSiteKey?: string;
  turnstileAutoToken?: boolean;
  traceResponse?: TraceResultResponse;
  beforeMeasurementResponse?: () => Promise<void>;
  probes?: GlobalpingProbe[];
}

async function installMocks(page: Page, options: MockOptions = {}): Promise<MockHandles> {
  let pollCount = 0;
  let styleRequests = 0;
  let enrichRequests = 0;
  let browserFallbackRequests = 0;
  let enriched = false;
  const mockProbes = options.probes || probes;
  const traceRequests: GlobalpingMeasurementRequest[] = [];
  if (options.turnstileSiteKey) {
    await page.addInitScript(({ autoToken }: { autoToken: boolean }) => {
      const testWindow = window as typeof window & { __issueMockTurnstile?: () => void };
      window.turnstile = {
        render: (element, renderOptions) => {
          const widget = document.createElement("div");
          widget.className = "mock-turnstile-widget";
          widget.style.width = "300px";
          widget.style.height = "65px";
          widget.style.background = "#2f2f2f";
          element.appendChild(widget);
          testWindow.__issueMockTurnstile = () => renderOptions.callback("mock-turnstile-token");
          if (autoToken) {
            window.setTimeout(() => testWindow.__issueMockTurnstile?.(), 0);
          }
          return "mock-widget-id";
        },
        reset: () => undefined,
      };
    }, { autoToken: options.turnstileAutoToken ?? true });
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
        sources: {
          countries: {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  geometry: { type: "Point", coordinates: [-98, 39] },
                  properties: { name: "United States" },
                },
              ],
            },
          },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "#edf0f2" } },
          {
            id: "country-label",
            type: "symbol",
            source: "countries",
            layout: { "text-field": ["get", "name"], "text-size": 12 },
            paint: { "text-color": "#3c4a51" },
          },
        ],
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
    await route.fulfill({ json: { probes: mockProbes, fetchedAt: "2026-06-09T00:00:00.000Z" } });
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
    traceRequests.push(body);
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
  await page.route("https://ipinfo.io/8.8.8.8", async (route) => {
    browserFallbackRequests += 1;
    await route.fulfill({
      headers: globalpingCorsHeaders,
      json: {
        ip: "8.8.8.8",
        city: "Mountain View",
        region: "California",
        country: "US",
        loc: "37.4056,-122.0775",
      },
    });
  });
  await page.route("https://stat.ripe.net/data/prefix-overview/data.json**", async (route) => {
    browserFallbackRequests += 1;
    expect(new URL(route.request().url()).searchParams.get("resource")).toBe("8.8.8.8");
    await route.fulfill({
      headers: globalpingCorsHeaders,
      json: {
        status: "ok",
        data: {
          resource: "8.8.8.0/24",
          asns: [{ asn: 15169, holder: "GOOGLE - Google LLC" }],
        },
      },
    });
  });
  await page.route("**/api/trace/m-smoke", async (route) => {
    if (options.traceResponse || enriched) {
      await route.fulfill({ json: options.traceResponse || traceResult("finished") });
      return;
    }
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/trace/enrich", async (route) => {
    enrichRequests += 1;
    enriched = true;
    await route.fulfill({ json: options.traceResponse || traceResult("finished") });
  });
  return {
    styleRequests: () => styleRequests,
    enrichRequests: () => enrichRequests,
    browserFallbackRequests: () => browserFallbackRequests,
    traceRequests: () => traceRequests,
  };
}

interface GlobalpingMeasurementRequest {
  locations?: Array<{ magic?: string }>;
  limit?: number;
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
  expect(state.glassBorder).toBe("rgba(45, 72, 82, 0.22)");
  expect(state.mutedBorder).toBe("rgba(45, 72, 82, 0.18)");
  expect(state.tableBorder).toBe("rgba(45, 72, 82, 0.16)");
  expect(state.panelBorderColor).not.toBe("rgba(255, 255, 255, 0.62)");
  expect(state.panelBorderWidth).toBe("1px");
}

async function expectSuggestionPopoverReadable(popover: Locator): Promise<void> {
  const state = await popover.evaluate((node) => {
    const popoverStyle = window.getComputedStyle(node);
    const option = node.querySelector('[role="option"]');
    const optionStyle = option ? window.getComputedStyle(option) : null;
    return {
      popoverBackground: popoverStyle.backgroundColor,
      popoverColor: popoverStyle.color,
      optionColor: optionStyle?.color ?? "",
    };
  });
  expect(state.popoverBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(state.popoverColor).not.toBe(state.popoverBackground);
  expect(state.optionColor).not.toBe(state.popoverBackground);
}

async function expectSuggestionPopoverOnTop(popover: Locator): Promise<void> {
  const state = await popover.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = Math.min(rect.bottom - 8, rect.top + Math.max(8, rect.height / 2));
    const topElement = document.elementFromPoint(x, y);
    return {
      popoverWidth: rect.width,
      popoverHeight: rect.height,
      topElementClass: topElement instanceof HTMLElement ? topElement.className : "",
      topElementText: topElement?.textContent?.trim() || "",
      topElementInsidePopover: Boolean(topElement && node.contains(topElement)),
    };
  });
  expect(state.popoverWidth).toBeGreaterThan(0);
  expect(state.popoverHeight).toBeGreaterThan(0);
  expect(state.topElementInsidePopover, `${state.topElementClass} ${state.topElementText}`).toBe(true);
}

async function expectDarkMapControls(page: Page): Promise<void> {
  await expect(page.locator(".tool-button").first()).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-group button").first()).toBeVisible();
  await expect
    .poll(async () => page.locator(".tool-button").first().evaluate((node) => window.getComputedStyle(node).backgroundColor))
    .toBe("rgba(9, 18, 28, 0.84)");
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
  expect(state.controlBg).toBe("rgba(9, 18, 28, 0.84)");
  expect(state.controlFg).toBe("rgba(245, 251, 255, 0.92)");
  expect(state.controlBorder).toBe("rgba(114, 220, 255, 0.24)");
  expect(state.toolbar?.backgroundColor).toBe(state.controlBg);
  expect(state.toolbar?.color).toBe(state.controlFg);
  expect(state.zoomGroup?.backgroundColor).toBe(state.controlBg);
  expect(state.zoomGroup?.borderColor).toBe(state.controlBorder);
  expect(state.zoomIcon?.filter).not.toBe("none");
  expect(state.attribution?.backgroundColor).toBe(state.controlBg);
  expect(state.attribution?.borderColor).toBe(state.controlBorder);
  expect(state.attributionButton?.backgroundColor).toBe(state.controlBg);
}

async function expectTurnstileDialogCentered(page: Page): Promise<void> {
  const state = await page.evaluate(() => {
    const surface = document.querySelector(".turnstile-dialog-surface");
    const dialog = surface?.getBoundingClientRect();
    const shell = document.querySelector(".turnstile-widget-shell")?.getBoundingClientRect();
    const widget = document.querySelector(".mock-turnstile-widget")?.getBoundingClientRect();
    return {
      glassMode: surface?.hasAttribute("data-liquid-glass") ? surface.getAttribute("data-liquid-glass-mode") || "" : "",
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentClient: document.documentElement.clientWidth,
      dialogWidth: dialog?.width ?? 0,
      dialogHeight: dialog?.height ?? 0,
      dialogLeft: dialog?.left ?? 0,
      dialogRight: dialog?.right ?? 0,
      dialogTop: dialog?.top ?? 0,
      dialogBottom: dialog?.bottom ?? 0,
      dialogCenterX: dialog ? dialog.left + dialog.width / 2 : 0,
      dialogCenterY: dialog ? dialog.top + dialog.height / 2 : 0,
      shellWidth: shell?.width ?? 0,
      widgetWidth: widget?.width ?? 0,
      shellLeft: shell?.left ?? 0,
      shellRight: shell?.right ?? 0,
    };
  });
  expect(state.glassMode).toMatch(/^(liquid|fallback)$/);
  expect(state.dialogWidth).toBeGreaterThan(0);
  expect(state.dialogHeight).toBeGreaterThan(0);
  expect(state.dialogLeft).toBeGreaterThanOrEqual(0);
  expect(state.dialogRight).toBeLessThanOrEqual(state.documentClient);
  expect(state.dialogTop).toBeGreaterThanOrEqual(0);
  expect(state.dialogBottom).toBeLessThanOrEqual(state.viewportHeight);
  expect(Math.abs(state.dialogCenterX - state.viewportWidth / 2)).toBeLessThanOrEqual(2);
  expect(Math.abs(state.dialogCenterY - state.viewportHeight / 2)).toBeLessThanOrEqual(2);
  expect(state.shellWidth).toBeGreaterThan(0);
  expect(state.widgetWidth).toBeLessThanOrEqual(300);
  expect(state.shellWidth).toBeLessThanOrEqual(state.dialogWidth);
  expect(state.shellLeft).toBeGreaterThanOrEqual(state.dialogLeft);
  expect(state.shellRight).toBeLessThanOrEqual(state.dialogRight);
}

async function expectLightTurnstileDialogReadable(page: Page): Promise<void> {
  const state = await page.evaluate(() => {
    const readAlpha = (value: string) => {
      const values = value.match(/rgba?\(([^)]+)\)/)?.[1]?.split(",").map((part) => part.trim()) || [];
      return values.length === 4 ? Number(values[3]) : 1;
    };
    const dialog = document.querySelector(".turnstile-dialog") as HTMLElement | null;
    const surface = document.querySelector(".turnstile-dialog-surface") as HTMLElement | null;
    const glass = document.querySelector(".turnstile-dialog-surface .glass") as HTMLElement | null;
    const fallback = document.querySelector(".turnstile-dialog-surface .liquid-glass-fallback-content") as HTMLElement | null;
    const frame = document.querySelector(".turnstile-dialog-surface .liquid-glass-content") as HTMLElement | null;
    const overlay = document.querySelector(".turnstile-overlay") as HTMLElement | null;
    const title = document.querySelector("#turnstile-dialog-title") as HTMLElement | null;
    const description = document.querySelector(".turnstile-dialog-copy p") as HTMLElement | null;
    const cancel = document.querySelector(".turnstile-cancel-button") as HTMLElement | null;
    const cancelRect = cancel?.getBoundingClientRect();
    const backgroundStyle = glass ? getComputedStyle(glass) : fallback ? getComputedStyle(fallback) : null;
    const frameStyle = frame ? getComputedStyle(frame) : null;
    const overlayStyle = overlay ? getComputedStyle(overlay) : null;
    const titleStyle = title ? getComputedStyle(title) : null;
    const descriptionStyle = description ? getComputedStyle(description) : null;
    const cancelStyle = cancel ? getComputedStyle(cancel) : null;
    return {
      glassMode: surface?.getAttribute("data-liquid-glass-mode") || "",
      hasDialogContent: Boolean(dialog),
      overlayAlpha: readAlpha(overlayStyle?.backgroundColor || ""),
      dialogAlpha: readAlpha(backgroundStyle?.backgroundColor || ""),
      dialogBorderAlpha: readAlpha(frameStyle?.borderColor || ""),
      titleColor: titleStyle?.color || "",
      descriptionColor: descriptionStyle?.color || "",
      cancelHeight: cancelRect?.height ?? 0,
      cancelWidth: cancelRect?.width ?? 0,
      cancelBackgroundAlpha: readAlpha(cancelStyle?.backgroundColor || ""),
      cancelBorderAlpha: readAlpha(cancelStyle?.borderColor || ""),
      cancelColor: cancelStyle?.color || "",
    };
  });
  expect(state.glassMode).toMatch(/^(liquid|fallback)$/);
  expect(state.hasDialogContent).toBe(true);
  expect(state.overlayAlpha).toBeLessThanOrEqual(0.25);
  expect(state.dialogAlpha).toBeGreaterThanOrEqual(0.62);
  expect(state.dialogAlpha).toBeLessThanOrEqual(0.8);
  expect(state.dialogBorderAlpha).toBeGreaterThanOrEqual(0.2);
  expect(state.titleColor).toBe("rgb(29, 29, 31)");
  expect(state.descriptionColor).toBe("rgb(81, 81, 84)");
  expect(state.cancelHeight).toBeGreaterThanOrEqual(34);
  expect(state.cancelHeight).toBeLessThanOrEqual(36);
  expect(state.cancelWidth).toBeGreaterThanOrEqual(78);
  expect(state.cancelBackgroundAlpha).toBeGreaterThanOrEqual(0.85);
  expect(state.cancelBorderAlpha).toBeGreaterThanOrEqual(0.3);
  expect(state.cancelColor).toBe("rgb(38, 54, 51)");
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

async function expectProbeMapProjection(page: Page, projection: "mercator" | "globe"): Promise<void> {
  await expect
    .poll(async () => {
      return page.locator(".map-container").evaluate((node) => {
        const map = (node as HTMLElement & { __globalTraceMap?: DebugMap }).__globalTraceMap;
        return map?.getProjection?.()?.type || null;
      });
    })
    .toBe(projection);
}

async function expectResultMapProjection(page: Page, projection: "mercator" | "globe"): Promise<void> {
  await expect
    .poll(async () => {
      return page.locator(".result-map").evaluate((node) => {
        const map = (node as HTMLElement & { __globalTraceResultMap?: DebugMap }).__globalTraceResultMap;
        return map?.getProjection?.()?.type || null;
      });
    })
    .toBe(projection);
}

async function expectResultMapHasCountryLabelStyle(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      return page.locator(".result-map").evaluate((node) => {
        const map = (node as HTMLElement & { __globalTraceResultMap?: DebugMap }).__globalTraceResultMap;
        return Boolean(map?.getStyle?.().layers?.some((layer) => layer.id === "country-label" && layer.type === "symbol"));
      });
    })
    .toBe(true);
}

async function expectResultMapGlobeLineStyle(page: Page): Promise<void> {
  const style = await page.locator(".result-map").evaluate((node) => {
    const map = (node as HTMLElement & { __globalTraceResultMap?: DebugMap }).__globalTraceResultMap;
    const layers = map?.getStyle?.().layers || [];
    const glow = layers.find((layer) => layer.id === "result-line-glow") as { paint?: Record<string, unknown> } | undefined;
    const line = layers.find((layer) => layer.id === "result-line") as { paint?: Record<string, unknown> } | undefined;
    return { glow: glow?.paint, line: line?.paint };
  });
  expect(style.glow).toMatchObject({
    "line-color": ["coalesce", ["get", "color"], "#587f78"],
    "line-width": ["case", ["boolean", ["get", "active"], false], 9, 4.5],
    "line-opacity": ["case", ["boolean", ["get", "active"], false], 0.34, 0.1],
    "line-blur": 3.2,
  });
  expect(style.line).toMatchObject({
    "line-color": ["coalesce", ["get", "color"], "#587f78"],
    "line-width": ["case", ["boolean", ["get", "active"], false], 4.8, 2.5],
    "line-opacity": ["case", ["boolean", ["get", "active"], false], 1, 0.28],
  });
}

async function expectResultHeaderActions(page: Page): Promise<void> {
  const actions = page.locator(".result-header-actions");
  await expect(actions.getByRole("group", { name: "结果地图视图" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "切换结果地图到 2D" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "切换结果地图到 3D" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "复制" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "关闭结果" })).toBeVisible();
  const state = await actions.evaluate((node) => {
    const rect = (node as HTMLElement).getBoundingClientRect();
    const toolbar = node.querySelector(".result-map-toolbar") as HTMLElement | null;
    const switchBase = node.querySelector(".result-map-toolbar-surface .liquid-glass-content") as HTMLElement | null;
    const switchButton = node.querySelector(".result-map-view-switch button") as HTMLElement | null;
    const copyButton = node.querySelector('[title="复制分享 URL"]') as HTMLElement | null;
    const closeButton = node.querySelector('[aria-label="关闭结果"]') as HTMLElement | null;
    const switchBaseStyle = switchBase ? window.getComputedStyle(switchBase) : null;
    const children = Array.from(node.children).map((child) => {
      const childRect = child.getBoundingClientRect();
      return {
        className: child.className,
        left: childRect.left,
        right: childRect.right,
      };
    });
    return {
      right: rect.right,
      documentClient: document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
      children,
      toolbarHeight: toolbar?.getBoundingClientRect().height ?? 0,
      switchBaseHeight: switchBase?.getBoundingClientRect().height ?? 0,
      switchBaseBackgroundColor: switchBaseStyle?.backgroundColor ?? "",
      switchBaseBorderColor: switchBaseStyle?.borderTopColor ?? "",
      switchBaseBorderStyle: switchBaseStyle?.borderTopStyle ?? "",
      switchBaseBorderWidth: Number.parseFloat(switchBaseStyle?.borderTopWidth ?? "0") || 0,
      closeHeight: closeButton?.getBoundingClientRect().height ?? 0,
      switchButtonHeight: switchButton?.getBoundingClientRect().height ?? 0,
      copyButtonHeight: copyButton?.getBoundingClientRect().height ?? 0,
      closeButtonHeight: closeButton?.getBoundingClientRect().height ?? 0,
    };
  });
  expect(state.right).toBeLessThanOrEqual(state.documentClient);
  expect(state.children[0]?.className).toContain("result-map-toolbar");
  expect(state.children[1]?.className).toContain("result-command-button");
  expect(state.children[2]?.className).toContain("result-command-button");
  expect(state.switchBaseBorderStyle).toBe("solid");
  expect(state.switchBaseBorderWidth).toBeGreaterThanOrEqual(1);
  expect(["transparent", "rgba(0, 0, 0, 0)"]).not.toContain(state.switchBaseBorderColor);
  expect(["transparent", "rgba(0, 0, 0, 0)"]).not.toContain(state.switchBaseBackgroundColor);
  if (state.documentClient > 820 && !(state.documentClient <= 900 && state.viewportHeight <= 560)) {
    const heights = [state.toolbarHeight, state.copyButtonHeight, state.closeHeight];
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
  } else {
    expect(state.switchBaseHeight).toBeGreaterThanOrEqual(44);
    expect(state.switchButtonHeight).toBeGreaterThanOrEqual(36);
    expect(state.switchButtonHeight).toBeLessThan(state.switchBaseHeight);
    expect(state.copyButtonHeight).toBeGreaterThanOrEqual(44);
    expect(state.closeButtonHeight).toBeGreaterThanOrEqual(44);
  }
}

async function expectResultMapGlobeDesktopSize(page: Page): Promise<void> {
  const state = await page.locator(".result-map").evaluate((node) => {
    const element = node as HTMLElement;
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      className: element.className,
      projection: element.dataset.mapProjection,
    };
  });
  expect(state.height).toBeGreaterThanOrEqual(600);
  expect(state.className).toContain("result-map-globe");
  expect(state.projection).toBe("globe");
}

async function expectMobileResultLayout(page: Page): Promise<void> {
  const state = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const result = document.querySelector(".results-section") as HTMLElement | null;
    const sectionHeader = document.querySelector(".results-section .section-header") as HTMLElement | null;
    const headerActions = document.querySelector(".result-header-actions") as HTMLElement | null;
    const toolbar = document.querySelector(".result-map-toolbar") as HTMLElement | null;
    const viewSwitchBase = document.querySelector(".result-map-toolbar-surface .liquid-glass-content") as HTMLElement | null;
    const viewSwitch = document.querySelector(".result-map-view-switch") as HTMLElement | null;
    const switchButton = document.querySelector(".result-map-view-switch button") as HTMLElement | null;
    const twoDimensionalButton = document.querySelector('[aria-label="切换结果地图到 2D"]') as HTMLElement | null;
    const threeDimensionalButton = document.querySelector('[aria-label="切换结果地图到 3D"]') as HTMLElement | null;
    const copyButton = document.querySelector('[title="复制分享 URL"]') as HTMLElement | null;
    const closeButton = document.querySelector('.result-header-actions [aria-label="关闭结果"]') as HTMLElement | null;
    const tabs = document.querySelector(".probe-tabs") as HTMLElement | null;
    const map = document.querySelector(".result-map") as HTMLElement | null;
    const table = document.querySelector(".hop-table-scroll") as HTMLElement | null;
    const cards = document.querySelector(".hop-card-list") as HTMLElement | null;
    const rawBlocks = Array.from(document.querySelectorAll(".raw-output[open] pre")) as HTMLElement[];
    const buttonStyleFor = (element: HTMLElement | null) => {
      if (!element) {
        return {
          backgroundColor: "",
          borderColor: "",
          className: "",
          color: "",
          pressed: "",
        };
      }
      const style = window.getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        className: element.className,
        color: style.color,
        pressed: element.getAttribute("aria-pressed") || "",
      };
    };
    const rectFor = (element: Element | null) => {
      const rect = element?.getBoundingClientRect();
      return rect
        ? {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }
        : { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    };
    const actionButtons = Array.from(headerActions?.querySelectorAll("button") || []) as HTMLButtonElement[];
    const buttonRects = actionButtons.map((button) => ({
      label: button.getAttribute("aria-label") || button.textContent?.trim() || "",
      ...rectFor(button),
    }));
    const overlaps: string[] = [];
    for (let index = 0; index < buttonRects.length; index += 1) {
      for (let next = index + 1; next < buttonRects.length; next += 1) {
        const first = buttonRects[index];
        const second = buttonRects[next];
        if (!first || !second) continue;
        const xOverlap = Math.min(first.right, second.right) - Math.max(first.left, second.left);
        const yOverlap = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
        if (xOverlap > 0.5 && yOverlap > 0.5) overlaps.push(`${first.label}/${second.label}`);
      }
    }
    const resultRect = rectFor(result);
    const sectionHeaderRect = rectFor(sectionHeader);
    const actionsRect = headerActions?.getBoundingClientRect();
    const toolbarRect = toolbar?.getBoundingClientRect();
    const viewSwitchRect = viewSwitch?.getBoundingClientRect();
    const buttonRect = switchButton?.getBoundingClientRect();
    const copyButtonRect = copyButton?.getBoundingClientRect();
    const closeButtonRect = closeButton?.getBoundingClientRect();
    const mapRect = map?.getBoundingClientRect();
    const cardRects = Array.from(cards?.querySelectorAll(".hop-card") || []).map(rectFor);
    const actionStyle = headerActions ? window.getComputedStyle(headerActions) : null;
    return {
      documentScroll: doc.scrollWidth,
      documentClient: doc.clientWidth,
      bodyScroll: body.scrollWidth,
      bodyClient: body.clientWidth,
      viewportHeight: window.innerHeight,
      resultLeft: resultRect.left,
      resultRight: resultRect.right,
      resultWidth: resultRect.width,
      sectionHeaderLeft: sectionHeaderRect.left,
      sectionHeaderRight: sectionHeaderRect.right,
      sectionHeaderWidth: sectionHeaderRect.width,
      headerWidth: actionsRect?.width ?? 0,
      headerRight: actionsRect?.right ?? 0,
      headerDisplay: actionStyle?.display ?? "",
      headerGridColumns: actionStyle?.gridTemplateColumns ?? "",
      toolbarWidth: toolbarRect?.width ?? 0,
      toolbarRight: toolbarRect?.right ?? 0,
      toolbarBottom: toolbarRect?.bottom ?? 0,
      viewSwitchBaseRect: rectFor(viewSwitchBase),
      viewSwitchWidth: viewSwitchRect?.width ?? 0,
      buttonHeight: buttonRect?.height ?? 0,
      copyButtonHeight: copyButtonRect?.height ?? 0,
      copyButtonTop: copyButtonRect?.top ?? 0,
      closeButtonHeight: closeButtonRect?.height ?? 0,
      closeButtonTop: closeButtonRect?.top ?? 0,
      tabsFlexWrap: tabs ? window.getComputedStyle(tabs).flexWrap : "",
      tabsOverflowX: tabs ? window.getComputedStyle(tabs).overflowX : "",
      tabsScrollWidth: tabs?.scrollWidth ?? 0,
      tabsClientWidth: tabs?.clientWidth ?? 0,
      mapHeight: mapRect?.height ?? 0,
      tableDisplay: table ? window.getComputedStyle(table).display : "",
      tableOverflowX: table ? window.getComputedStyle(table).overflowX : "",
      tableScrollWidth: table?.scrollWidth ?? 0,
      tableClientWidth: table?.clientWidth ?? 0,
      cardListDisplay: cards ? window.getComputedStyle(cards).display : "",
      cardRects,
      rawMaxHeights: rawBlocks.map((raw) => window.getComputedStyle(raw).maxHeight),
      actionButtonStyles: {
        twoDimensional: buttonStyleFor(twoDimensionalButton),
        threeDimensional: buttonStyleFor(threeDimensionalButton),
        copy: buttonStyleFor(copyButton),
        close: buttonStyleFor(closeButton),
      },
      viewButtonRects: [twoDimensionalButton, threeDimensionalButton].map((button) => ({
        label: button?.getAttribute("aria-label") || "",
        ...rectFor(button),
      })),
      buttonRects,
      overlaps,
    };
  });
  expect(state.documentScroll).toBeLessThanOrEqual(state.documentClient);
  expect(state.bodyScroll).toBeLessThanOrEqual(state.bodyClient);
  expect(state.resultLeft).toBeGreaterThanOrEqual(0);
  expect(state.resultRight).toBeLessThanOrEqual(state.documentClient);
  expect(state.sectionHeaderLeft).toBeGreaterThanOrEqual(state.resultLeft);
  expect(state.sectionHeaderRight).toBeLessThanOrEqual(state.resultRight);
  expect(state.sectionHeaderWidth).toBeLessThanOrEqual(state.resultWidth);
  expect(state.headerRight).toBeLessThanOrEqual(state.documentClient);
  expect(state.toolbarRight).toBeLessThanOrEqual(state.documentClient);
  expect(state.headerRight).toBeLessThanOrEqual(state.resultRight);
  expect(state.toolbarRight).toBeLessThanOrEqual(state.resultRight);
  expect(state.headerDisplay).toBe("grid");
  expect(state.headerGridColumns.split(" ").filter(Boolean)).toHaveLength(2);
  expect(state.headerWidth).toBeGreaterThanOrEqual(Math.min(280, state.documentClient - 40));
  expect(state.headerWidth).toBeLessThanOrEqual(state.resultWidth);
  expect(state.toolbarWidth).toBeGreaterThanOrEqual(state.headerWidth - 1);
  expect(state.viewSwitchWidth).toBeGreaterThanOrEqual(state.toolbarWidth - 10);
  expect(state.buttonRects).toHaveLength(4);
  expect(state.overlaps).toEqual([]);
  for (const rect of state.buttonRects) {
    expect(rect.left).toBeGreaterThanOrEqual(state.resultLeft);
    expect(rect.right).toBeLessThanOrEqual(state.resultRight);
    expect(rect.right).toBeLessThanOrEqual(state.documentClient);
  }
  expect(state.viewSwitchBaseRect.width).toBeGreaterThan(0);
  expect(state.viewSwitchBaseRect.height).toBeGreaterThanOrEqual(44);
  expect(state.viewSwitchBaseRect.right).toBeLessThanOrEqual(state.resultRight);
  for (const rect of state.viewButtonRects) {
    expect(rect.left).toBeGreaterThanOrEqual(state.viewSwitchBaseRect.left + 2);
    expect(rect.right).toBeLessThanOrEqual(state.viewSwitchBaseRect.right - 2);
    expect(rect.top).toBeGreaterThanOrEqual(state.viewSwitchBaseRect.top + 2);
    expect(rect.bottom).toBeLessThanOrEqual(state.viewSwitchBaseRect.bottom - 2);
    expect(rect.height).toBeLessThan(state.viewSwitchBaseRect.height);
  }
  expect(state.buttonHeight).toBeGreaterThanOrEqual(36);
  expect(state.buttonHeight).toBeLessThan(state.viewSwitchBaseRect.height);
  expect(state.copyButtonHeight).toBeGreaterThanOrEqual(44);
  expect(state.closeButtonHeight).toBeGreaterThanOrEqual(44);
  expect(state.actionButtonStyles.copy.className).toContain("result-command-button");
  expect(state.actionButtonStyles.close.className).toContain("result-command-button");
  expect(state.actionButtonStyles.twoDimensional.className).toContain("result-view-button");
  expect(state.actionButtonStyles.threeDimensional.className).toContain("result-view-button");
  expect(state.actionButtonStyles.copy.backgroundColor).toBe(state.actionButtonStyles.close.backgroundColor);
  expect(state.actionButtonStyles.copy.borderColor).toBe(state.actionButtonStyles.close.borderColor);
  expect(state.actionButtonStyles.copy.color).toBe(state.actionButtonStyles.close.color);
  const viewButtonStyles = [
    state.actionButtonStyles.twoDimensional,
    state.actionButtonStyles.threeDimensional,
  ];
  const activeViewButtonStyle = viewButtonStyles.find((style) => style.pressed === "true");
  const inactiveViewButtonStyle = viewButtonStyles.find((style) => style.pressed !== "true");
  expect(activeViewButtonStyle).toBeTruthy();
  expect(inactiveViewButtonStyle).toBeTruthy();
  expect(activeViewButtonStyle?.backgroundColor).not.toBe(inactiveViewButtonStyle?.backgroundColor);
  expect(activeViewButtonStyle?.backgroundColor).not.toBe(state.actionButtonStyles.copy.backgroundColor);
  expect(activeViewButtonStyle?.color).not.toBe(inactiveViewButtonStyle?.color);
  expect(Math.abs(state.copyButtonTop - state.closeButtonTop)).toBeLessThanOrEqual(2);
  expect(state.copyButtonTop).toBeGreaterThanOrEqual(state.toolbarBottom - 1);
  if (state.documentClient <= 560) {
    expect(state.tabsFlexWrap).toBe("wrap");
    expect(state.tabsOverflowX).toBe("visible");
  } else {
    expect(["auto", "scroll"]).toContain(state.tabsOverflowX);
    expect(state.tabsScrollWidth).toBeGreaterThanOrEqual(state.tabsClientWidth);
  }
  expect(state.mapHeight).toBeGreaterThanOrEqual(300);
  expect(state.mapHeight).toBeLessThanOrEqual(480);
  expect(state.tableDisplay).toBe("none");
  expect(state.cardListDisplay).toBe("grid");
  expect(state.cardRects.length).toBeGreaterThan(0);
  for (const rect of state.cardRects) {
    expect(rect.left).toBeGreaterThanOrEqual(state.resultLeft);
    expect(rect.right).toBeLessThanOrEqual(state.resultRight);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(44);
  }
  expect(state.rawMaxHeights).toHaveLength(2);
  for (const maxHeight of state.rawMaxHeights) {
    expect(maxHeight).toContain("px");
  }
}

async function expectHopTableScrollsWithinPanel(page: Page): Promise<void> {
  const state = await page.locator(".hop-table-scroll").evaluate((node) => {
    const item = node as HTMLElement;
    const cardList = document.querySelector(".hop-card-list") as HTMLElement | null;
    const cards = Array.from(cardList?.querySelectorAll(".hop-card") || []) as HTMLElement[];
    const result = document.querySelector(".results-section") as HTMLElement | null;
    const resultRect = result?.getBoundingClientRect();
    const cardRects = cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    });
    return {
      display: window.getComputedStyle(item).display,
      overflowX: window.getComputedStyle(item).overflowX,
      clientWidth: item.clientWidth,
      scrollWidth: item.scrollWidth,
      cardListDisplay: cardList ? window.getComputedStyle(cardList).display : "",
      resultLeft: resultRect?.left ?? 0,
      resultRight: resultRect?.right ?? 0,
      cardRects,
      documentScroll: document.documentElement.scrollWidth,
      documentClient: document.documentElement.clientWidth,
    };
  });
  if (state.display === "none") {
    expect(state.cardListDisplay).toBe("grid");
    expect(state.cardRects.length).toBeGreaterThan(0);
    for (const rect of state.cardRects) {
      expect(rect.left).toBeGreaterThanOrEqual(state.resultLeft);
      expect(rect.right).toBeLessThanOrEqual(state.resultRight);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(44);
    }
    expect(state.documentScroll).toBeLessThanOrEqual(state.documentClient);
    return;
  }
  expect(["auto", "scroll"]).toContain(state.overflowX);
  expect(state.scrollWidth).toBeGreaterThanOrEqual(state.clientWidth);
  expect(state.documentScroll).toBeLessThanOrEqual(state.documentClient);
}

async function expectHopTableColumns(page: Page): Promise<void> {
  const headers = await page.locator(".hop-table th").allInnerTexts();
  expect(headers).toEqual(["TTL", "IP / hostname", "loss", "avg", "min", "max", "ASN", "region", "owner / ISP"]);
}

async function expectPeerAsHopLink(page: Page): Promise<void> {
  const link = page.getByRole("link", { name: "在 peer.as 查看 8.8.8.8" });
  await expect(link).toHaveAttribute("href", "https://peer.as/?q=8.8.8.8");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
}

async function expectVisibleHopText(page: Page, text: string): Promise<void> {
  await expect(page.locator(".hop-table:visible, .hop-card-list:visible").getByText(text, { exact: true })).toBeVisible();
}

async function clickVisibleHop(page: Page, ttl: number): Promise<void> {
  const card = page.locator(`.hop-card[data-ttl="${ttl}"]:visible`);
  if (await card.count()) {
    await card.click();
    return;
  }
  await page.locator(`.hop-table tr[data-ttl="${ttl}"]`).click();
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
        const ready = (node as HTMLElement & { __globalTraceResultMapReady?: boolean }).__globalTraceResultMapReady;
        if (ready) return true;
        return Boolean(map && (typeof map.loaded !== "function" || map.loaded()));
      });
    })
    .toBe(true);
}

async function expectResultRouteData(
  page: Page,
  expected: { labels: string[]; minLineLength: number; maxLineLngSpan: number; maxFitLngSpan?: number },
): Promise<void> {
  await expect
    .poll(async () => resultRouteState(page))
    .toMatchObject({
      labels: expected.labels,
    });

  const state = await resultRouteState(page);
  expect(state.lineLength).toBeGreaterThanOrEqual(expected.minLineLength);
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
          activeRouteId?: string | null;
        };
      }
    ).__globalTraceResultData;
    const features = data?.featureCollection?.features || [];
    const activeRouteId = data?.activeRouteId || null;
    const activeRouteFeature = (feature: { properties?: Record<string, unknown> }) => {
      return !activeRouteId || feature.properties?.routeId === activeRouteId;
    };
    const line = features.find((feature) => feature.properties?.kind === "path" && activeRouteFeature(feature))?.geometry?.coordinates || [];
    const labels = features
      .filter((feature) => feature.properties?.kind === "hop" && activeRouteFeature(feature))
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
  await expect
    .poll(async () => {
      const point = await resultMapRouteNodeCanvasPoint(page, nodeId);
      const box = await canvas.boundingBox();
      if (!point || !box) return null;
      await page.mouse.click(box.x + point.x, box.y + point.y);
      return page.locator(".result-map").evaluate((node) => {
        return (node as HTMLElement & { __globalTraceSelectedRouteNodeId?: string | null }).__globalTraceSelectedRouteNodeId || null;
      });
    })
    .toBe(nodeId);
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
        const features =
          map.queryRenderedFeatures?.([point.x, point.y], {
            layers: ["result-points", "result-endpoint-halo", "result-endpoint-core", "result-hop-labels"],
          }) || [];
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
  getProjection?: () => { type: "mercator" | "globe" };
  getStyle?: () => { layers?: Array<{ id?: string; type?: string }> };
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

function makeChinaSmokeProbes(count: number): GlobalpingProbe[] {
  const cities = ["Shenzhen", "Nanning", "Guangzhou", "Shenzhou"];
  return Array.from({ length: count }, (_, index) => ({
    location: {
      continent: "AS",
      region: "Eastern Asia",
      country: "CN",
      state: null,
      city: cities[index] || `China ${index}`,
      asn: 4134,
      latitude: 22.54 + index,
      longitude: 114.05 + index,
      network: "China Telecom",
    },
    tags: [index === 3 ? "datacenter-network" : "eyeball-network"],
    resolvers: [],
  }));
}

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
    results:
      status === "in-progress"
        ? []
        : [
            {
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
              result: {
                status: "finished",
                resolvedAddress: "8.8.8.8",
                resolvedHostname: "dns.google",
                rawOutput: "Host Loss% Avg",
                hops: [
                  {
                    resolvedAddress: "8.8.8.8",
                    resolvedHostname: "dns.google",
                    timings: [{ rtt: 1.2 }],
                    stats: { min: 1, avg: 1.2, max: 2, total: 1, rcv: 1, drop: 0, loss: 0 },
                  },
                ],
              },
            },
          ],
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
