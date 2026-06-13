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
    await expect(page.getByRole("listbox", { name: "候选列表" })).toHaveCount(0);
    await magicInput.fill("US+Com");
    const magicSuggestions = page.getByRole("listbox", { name: "候选列表" });
    await expect(magicSuggestions.getByRole("option", { name: "US+Comcast", exact: true })).toBeVisible();
    await expect(magicSuggestions.getByRole("option", { name: "US+AS7922+Comcast", exact: true })).toBeVisible();
    await expectSuggestionPopoverOnTop(magicSuggestions);
    await magicSuggestions.getByRole("option", { name: "US+Comcast", exact: true }).click();
    await expect(page.getByText("1 / 3 probes 匹配")).toBeVisible();
    await expect(magicInput).toHaveValue("US+Comcast");
    await magicInput.fill("");
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
    await expect(page.getByRole("button", { name: "分享" })).toBeVisible();
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
    const homeMapHeight = await expectCompactHomeProbeMapLayout(page);
    if (viewport.name === "1440x1000") {
      await expectProbeMapOverviewZoom(page, 1.15);
    }
    await expectNoPageOverflow(page);

    await page.getByRole("button", { name: "开始网络路径诊断" }).click();

    await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
    await expect(page.getByRole("group", { name: "结果地图视图" })).toBeVisible();
    await expectResultHeaderActions(page);
    await expectGeoIpMetricReadable(page);
    await expect(page.getByRole("button", { name: "切换结果地图到 2D" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("tab", { name: /Los Angeles/ })).toHaveAttribute("aria-selected", "true");
    await expectHopTableColumns(page);
    await expectVisibleHopText(page, "8.8.8.8");
    await expect(page.getByLabel("trace result map")).toBeVisible();
    await expectMapCanvasPainted(page);
    await expectResultMapProjection(page, "mercator");
    await expectResultMapHeight(page, homeMapHeight);

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
    await expect(page.getByRole("button", { name: "分享" })).toBeVisible();
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
  await installMocks(page);

  await page.goto("/");
  await expect(page.getByRole("button", { name: "开始网络路径诊断" })).toBeVisible();
  const longMagic = Array.from({ length: 20 }, (_, index) => `Novosibirsk-${index}+RU+AS${21000 + index}+datacenter-network`).join(
    ", ",
  );
  await page.getByLabel("magic string").fill(longMagic);

  await expect(page.getByTestId("filter-chips")).toContainText("Novosibirsk-0+RU+AS21000+datacenter-network");
  await expect(page.getByRole("button", { name: "开始网络路径诊断" })).toBeVisible();
  await expectFilterSummaryConstrainsLongChips(page);
  await expectNoPageOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("probe result tabs keep horizontal scrollbar clear of route choices", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page, { traceResponse: multiProbeTraceResult(10) });

  await page.goto("/?measurement=m-smoke");

  await expect(page.getByText("finished · 10 probes · m-smoke")).toBeVisible();
  await expectProbeTabsScrollbarLayout(page);
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

test("generic magic and tag suggestions come from visible mock probes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page, { probes: makeShanghaiSmokeProbes() });

  await page.goto("/");

  await expect(page.getByText("4 / 4 probes 匹配")).toBeVisible();
  const magicInput = page.getByLabel("magic string");
  await magicInput.fill("CN+Sha");
  await expect(page.getByText("1 / 4 probes 匹配")).toBeVisible();
  const magicSuggestions = page.getByRole("listbox", { name: "候选列表" });
  await expect(magicSuggestions.getByRole("option", { name: "CN+Shanghai" })).toBeVisible();
  await expect(magicSuggestions.getByRole("option", { name: "Shanghai+CN+AS4134+eyeball-network" })).toBeVisible();
  await magicInput.fill("China Telecom+Sh");
  await expect(page.getByText("2 / 4 probes 匹配")).toBeVisible();
  await expect(magicSuggestions.getByRole("option", { name: "Shenzhen+CN+AS4134+China Telecom" })).toBeVisible();

  await page.getByRole("button", { name: "重置筛选" }).click();
  await expect(magicInput).toHaveValue("");
  await page.getByText("高级参数与精确筛选").click();
  const tagInput = page.getByLabel("tag");
  await tagInput.fill("eye");
  await expect(page.getByText("3 / 4 probes 匹配")).toBeVisible();
  const tagSuggestions = page.getByRole("listbox", { name: "候选列表" });
  await expect(tagSuggestions.getByRole("option", { name: "eyeball-network" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("saved NextTrace token sends browser batch request", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleErrors = collectConsoleErrors(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("globaltrace.nexttraceApiToken", "nt-token");
  });
  const mocks = await installMocks(page);

  await page.goto("/");

  await expect(page.getByText("NextTrace API Token 直连已启用")).toBeVisible();
  await page.getByRole("button", { name: "开始网络路径诊断" }).click();

  await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
  await expect.poll(mocks.nexttraceBatchRequests).toBe(1);
  await expect.poll(mocks.enrichRequests).toBe(0);
  await expectVisibleHopText(page, "AS15169");
  expect(consoleErrors).toEqual([]);
});

test("token save defaults to session storage", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page);

  await page.goto("/");
  await page.getByText("高级参数与精确筛选").click();
  await page.getByRole("textbox", { name: "Globalping Token" }).fill("gp-token");
  await page.getByRole("button", { name: "保存 Globalping" }).click();
  await page.getByRole("textbox", { name: "NextTrace API Token" }).fill("nt-token");
  await page.getByRole("button", { name: "保存 NextTrace" }).click();

  await expect(page.getByText("Globalping Token 仅当前会话可用")).toBeVisible();
  await expect(page.getByText("NextTrace Token 仅当前会话可用")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        globalpingLocal: window.localStorage.getItem("globaltrace.globalpingToken"),
        globalpingSession: window.sessionStorage.getItem("globaltrace.globalpingToken"),
        nexttraceLocal: window.localStorage.getItem("globaltrace.nexttraceApiToken"),
        nexttraceSession: window.sessionStorage.getItem("globaltrace.nexttraceApiToken"),
      })),
    )
    .toEqual({
      globalpingLocal: null,
      globalpingSession: "gp-token",
      nexttraceLocal: null,
      nexttraceSession: "nt-token",
    });
  expect(consoleErrors).toEqual([]);
});

test("about page exposes provider attribution links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = collectConsoleErrors(page);
  await installBackgroundMock(page);

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
  await expect(page.getByRole("button", { name: "分享" })).toBeVisible();
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
  await expectResultRouteData(page, { labels: ["1-2", "5"], minLineLength: 2, maxLineLngSpan: 140 });
  await clickResultMapRouteNode(page, "route-0-node-2");
  await expect(page.locator('.hop-table tr[data-ttl="1"]')).not.toHaveClass(/selected/);
  await expect(page.locator('.hop-table tr[data-ttl="2"]')).not.toHaveClass(/selected/);
  await expectResultSelectedRouteNode(page, null);
  await expectResultMapPopup(page, "TTL 2");
  await clickVisibleHop(page, 5);
  await expect(page.locator('.hop-table tr[data-ttl="1"]')).not.toHaveClass(/selected/);
  await expect(page.locator('.hop-table tr[data-ttl="5"]')).toHaveClass(/selected/);
  await expectResultSelectedRouteNode(page, "route-0-node-5");
  await page.getByRole("button", { name: "切换结果地图到 3D" }).click();
  await expectResultMapProjection(page, "globe");
  await expectResultRouteData(page, { labels: ["1-2", "5"], minLineLength: 2, maxLineLngSpan: 140 });
  await clickResultMapRouteNode(page, "route-0-node-1");
  await expect(page.locator('.hop-table tr[data-ttl="1"]')).not.toHaveClass(/selected/);
  await expect(page.locator('.hop-table tr[data-ttl="2"]')).not.toHaveClass(/selected/);
  await expect(page.locator('.hop-table tr[data-ttl="5"]')).toHaveClass(/selected/);
  await expectResultSelectedRouteNode(page, "route-0-node-5");
  await expectResultMapPopup(page, "TTL 1");
  await clickVisibleHop(page, 1);
  await expect(page.locator('.hop-table tr[data-ttl="1"]')).toHaveClass(/selected/);
  await expect(page.locator('.hop-table tr[data-ttl="5"]')).not.toHaveClass(/selected/);
  await expectResultSelectedRouteNode(page, "route-0-node-1");
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

test("mobile advanced panel starts trace without an auth dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = collectConsoleErrors(page);
  const mocks = await installMocks(page);

  await page.goto("/");

  await expect(page.getByText("Globalping credits 控制诊断创建")).toBeVisible();
  await page.getByText("高级参数与精确筛选").click();
  await page.getByLabel("ASN").fill("7922");
  await expect(page.getByLabel("ASN")).toHaveValue("7922");
  await expect(page.getByLabel("network")).toBeVisible();
  await expect(page.getByLabel("tag")).toBeVisible();
  await expect(page.getByLabel("Globalping Token")).toBeVisible();

  await page.getByRole("button", { name: "开始网络路径诊断" }).click();
  await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
  await expect.poll(mocks.enrichRequests).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectNoPageOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("shared result opens directly from measurement ID", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = collectConsoleErrors(page);
  const mocks = await installMocks(page);

  await page.goto("/?measurement=m-smoke");

  await expect(page.getByText("finished · 1 probes · m-smoke")).toBeVisible();
  await expect.poll(mocks.enrichRequests).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
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

test("liquid glass surfaces keep textured backgrounds and restrained shadows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const consoleErrors = collectConsoleErrors(page);
  await installMocks(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("globaltrace.liquidGlass", "enabled");
  });

  await page.goto("/");

  await expect(page.locator(".primary-controls-surface")).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.filter-summary-surface[data-liquid-glass-mode="liquid"]')).toBeVisible();
  await expect(page.locator('.run-action-surface[data-liquid-glass-interactive="true"]')).toBeVisible();
  await expect(page.getByText(/背景：岁月的层峦/)).toBeVisible();
  await expectLiquidGlassVisualStructure(page);
  expect(consoleErrors).toEqual([]);
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
  nexttraceBatchRequests: () => number;
  traceRequests: () => GlobalpingMeasurementRequest[];
}

interface MockOptions {
  expectedIpVersion?: 4 | 6;
  traceResponse?: TraceResultResponse;
  beforeMeasurementResponse?: () => Promise<void>;
  probes?: GlobalpingProbe[];
}

async function installBackgroundMock(page: Page): Promise<void> {
  await page.route("**/api/background", async (route) => {
    await route.fulfill({
      json: {
        imageUrl: "/api/background/image",
        title: "岁月的层峦",
        copyright: "落日，恶地国家公园，南达科他州，美国 (© Troy Harrison/Getty Images)",
        copyrightLink: "https://www.bing.com/search?q=%E6%81%B6%E5%9C%B0",
        source: "bing",
      },
    });
  });
  await page.route("**/api/background/image", async (route) => {
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPMqP9fDwAF9ALka6ocEgAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
  });
}

async function installMocks(page: Page, options: MockOptions = {}): Promise<MockHandles> {
  let pollCount = 0;
  let styleRequests = 0;
  let enrichRequests = 0;
  let nexttraceBatchRequests = 0;
  let enriched = false;
  const mockProbes = options.probes || probes;
  const traceRequests: GlobalpingMeasurementRequest[] = [];
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
    await route.fulfill({ json: { mapStyleUrl: "/mock-style.json" } });
  });
  await installBackgroundMock(page);
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
  await page.route("https://api.nxtrace.org/v4/ipGeo/batch", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "X-NextTrace-Token, Content-Type",
        },
      });
      return;
    }
    nexttraceBatchRequests += 1;
    expect((await route.request().postDataJSON()).ips).toEqual(["8.8.8.8"]);
    await route.fulfill({
      headers: globalpingCorsHeaders,
      json: {
        results: [
          {
            ip: "8.8.8.8",
            ok: true,
            data: {
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
              source: "mock-nexttrace",
            },
          },
        ],
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
    expect(await route.request().postDataJSON()).toEqual({ measurementId: "m-smoke" });
    await route.fulfill({ json: options.traceResponse || traceResult("finished") });
  });
  return {
    styleRequests: () => styleRequests,
    enrichRequests: () => enrichRequests,
    nexttraceBatchRequests: () => nexttraceBatchRequests,
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

async function expectProbeTabsScrollbarLayout(page: Page): Promise<void> {
  const state = await page.locator(".probe-tabs").evaluate((node) => {
    const tabs = node as HTMLElement;
    const buttons = Array.from(tabs.querySelectorAll("button")) as HTMLElement[];
    const tabsRect = tabs.getBoundingClientRect();
    const buttonBottom = Math.max(...buttons.map((button) => button.getBoundingClientRect().bottom));
    const firstButtonStyle = buttons[0] ? window.getComputedStyle(buttons[0]) : null;
    const styles = window.getComputedStyle(tabs);
    return {
      bottomGap: tabsRect.bottom - buttonBottom,
      buttonMinHeight: firstButtonStyle?.minHeight ?? "",
      buttonPaddingRight: firstButtonStyle?.paddingRight ?? "",
      buttonPaddingTop: firstButtonStyle?.paddingTop ?? "",
      clientWidth: tabs.clientWidth,
      flexWrap: styles.flexWrap,
      overflowX: styles.overflowX,
      paddingBottom: Number.parseFloat(styles.paddingBottom),
      scrollbarColor: styles.scrollbarColor,
      scrollbarWidth: styles.scrollbarWidth,
      scrollWidth: tabs.scrollWidth,
    };
  });
  expect(state.flexWrap).toBe("nowrap");
  expect(["auto", "scroll"]).toContain(state.overflowX);
  expect(state.scrollWidth).toBeGreaterThan(state.clientWidth);
  expect(state.paddingBottom).toBeGreaterThanOrEqual(8);
  expect(state.paddingBottom).toBeLessThanOrEqual(10);
  expect(state.bottomGap).toBeGreaterThanOrEqual(7);
  expect(state.bottomGap).toBeLessThanOrEqual(11);
  expect(state.buttonMinHeight).toBe("42px");
  expect(state.buttonPaddingTop).toBe("6px");
  expect(state.buttonPaddingRight).toBe("9px");
  expect(state.scrollbarWidth).toBe("thin");
  expect(state.scrollbarColor).not.toBe("auto");
}

async function expectGeoIpMetricReadable(page: Page): Promise<void> {
  const metric = page.getByLabel("GeoIP enrichment status");
  await expect(metric).toContainText("GeoIP");
  await expect(metric).toContainText("cache 0 · fetch 1");

  const state = await metric.evaluate((node) => {
    const value = node.querySelector(".geoip-value") as HTMLElement | null;
    const style = value ? window.getComputedStyle(value) : null;
    return {
      overflowX: style?.overflowX ?? "",
      scrollOverflow: value ? value.scrollWidth - value.clientWidth : 0,
      textOverflow: style?.textOverflow ?? "",
      whiteSpace: style?.whiteSpace ?? "",
    };
  });

  expect(state.textOverflow).toBe("clip");
  expect(state.overflowX).toBe("visible");
  expect(state.whiteSpace).toBe("normal");
  expect(state.scrollOverflow).toBeLessThanOrEqual(1);
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

async function expectLiquidGlassVisualStructure(page: Page): Promise<void> {
  const state = await page.evaluate(() => {
    const alphaOf = (value: string) => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return 1;
      const parts = match[1].split(",").map((part) => part.trim());
      if (parts.length < 4) return 1;
      return Number.parseFloat(parts[3]) || 0;
    };
    const read = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = window.getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundAlpha: alphaOf(style.backgroundColor),
        boxShadow: style.boxShadow,
      };
    };
    return {
      ambientBackground: (() => {
        const element = document.querySelector(".ambient-background");
        if (!element) return null;
        const style = window.getComputedStyle(element, "::before");
        return {
          filter: style.filter,
          backgroundImage: style.backgroundImage,
        };
      })(),
      bodyTextureOpacity: Number.parseFloat(window.getComputedStyle(document.body, "::before").opacity || "0") || 0,
      filterPanel: read(".filter-panel"),
      primaryControls: read(".primary-controls-surface"),
      filterSummary: read('.filter-summary-surface[data-liquid-glass-mode="liquid"] .filter-summary'),
      statusBar: read('.status-surface[data-liquid-glass-mode="liquid"] .liquid-glass-content'),
      runActionButton: read('.run-action-surface[data-liquid-glass-mode="liquid"] .primary-action'),
    };
  });

  expect(state.ambientBackground?.filter).toContain("blur(28px)");
  expect(state.ambientBackground?.filter).toContain("saturate(1.08)");
  expect(state.ambientBackground?.backgroundImage).toContain("/api/background/image");
  expect(state.bodyTextureOpacity).toBeGreaterThan(0.2);
  expect(state.primaryControls?.backgroundAlpha).toBeLessThanOrEqual(0.32);
  expect(state.filterSummary?.backgroundAlpha).toBeLessThanOrEqual(0.32);
  expect(state.statusBar?.backgroundAlpha).toBeLessThanOrEqual(0.36);
  expect(state.runActionButton?.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(state.filterPanel?.boxShadow).not.toMatch(/\b(?:58|70)px\b/);
  expect(state.primaryControls?.boxShadow).not.toMatch(/\b(?:58|70)px\b/);
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

async function expectProbeMapOverviewZoom(page: Page, minZoom: number): Promise<void> {
  await expect
    .poll(async () => {
      return page.locator(".map-container").evaluate((node) => {
        const map = (node as HTMLElement & { __globalTraceMap?: DebugMap }).__globalTraceMap;
        return map?.getZoom() ?? 0;
      });
    })
    .toBeGreaterThanOrEqual(minZoom);
}

async function expectCompactHomeProbeMapLayout(page: Page): Promise<number> {
  const mapSection = page.getByLabel("probe map");
  await expect(mapSection.getByText("3 / 3 probes", { exact: true })).toBeVisible();
  await expect(mapSection.getByText("点选地图表示选择筛选条件，不承诺指定精确 probe")).toBeVisible();
  await expect(mapSection.getByText("eyeball", { exact: true })).toBeVisible();
  await expect(mapSection.getByText("datacenter", { exact: true })).toBeVisible();

  const state = await page.locator(".map-section").evaluate((section) => {
    const map = section.querySelector(".map-container") as HTMLElement | null;
    const status = section.querySelector(".map-status") as HTMLElement | null;
    const legend = section.querySelector(".map-legend") as HTMLElement | null;
    const legendItems = Array.from(section.querySelectorAll(".map-legend > span")) as HTMLElement[];
    const mapRect = map?.getBoundingClientRect();
    const statusStyle = status ? window.getComputedStyle(status) : null;
    const statusTextStyle = status?.querySelector("strong") ? window.getComputedStyle(status.querySelector("strong") as HTMLElement) : null;
    const noticeStyle = status?.querySelector("div:first-child span")
      ? window.getComputedStyle(status.querySelector("div:first-child span") as HTMLElement)
      : null;
    const legendStyle = legend ? window.getComputedStyle(legend) : null;
    const firstLegendItemStyle = legendItems[0] ? window.getComputedStyle(legendItems[0]) : null;

    return {
      mapHeight: mapRect?.height ?? 0,
      mapComputedHeight: map ? window.getComputedStyle(map).height : "",
      statusMinHeight: statusStyle?.minHeight ?? "",
      statusPaddingTop: statusStyle?.paddingTop ?? "",
      statusPaddingRight: statusStyle?.paddingRight ?? "",
      statusGap: statusStyle?.gap ?? "",
      statusOverflow: status ? status.scrollHeight - status.clientHeight : 0,
      statusTextLineHeight: statusTextStyle?.lineHeight ?? "",
      noticeLineHeight: noticeStyle?.lineHeight ?? "",
      legendGap: legendStyle?.gap ?? "",
      legendTexts: legendItems.map((item) => item.textContent?.trim()),
      legendItemMinHeight: firstLegendItemStyle?.minHeight ?? "",
      legendItemPaddingTop: firstLegendItemStyle?.paddingTop ?? "",
      legendItemPaddingRight: firstLegendItemStyle?.paddingRight ?? "",
    };
  });

  expect(state.mapHeight).toBeGreaterThanOrEqual(300);
  expect(Math.abs(Number.parseFloat(state.mapComputedHeight) - state.mapHeight)).toBeLessThanOrEqual(1);
  expect(state.statusMinHeight).toBe("44px");
  expect(state.statusPaddingTop).toBe("7px");
  expect(state.statusPaddingRight).toBe("10px");
  expect(state.statusGap).toBe("8px");
  expect(state.statusOverflow).toBeLessThanOrEqual(1);
  expect(Number.parseFloat(state.statusTextLineHeight)).toBeLessThan(16);
  expect(Number.parseFloat(state.noticeLineHeight)).toBeLessThan(15);
  expect(state.legendGap).toBe("6px");
  expect(state.legendTexts).toEqual(["eyeball", "datacenter"]);
  expect(state.legendItemMinHeight).toBe("22px");
  expect(state.legendItemPaddingTop).toBe("3px");
  expect(state.legendItemPaddingRight).toBe("8px");

  return state.mapHeight;
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

async function expectResultMapHeight(page: Page, expectedHeight: number): Promise<void> {
  const resultHeight = await page.locator(".result-map").evaluate((node) => node.getBoundingClientRect().height);
  expect(Math.abs(resultHeight - expectedHeight)).toBeLessThanOrEqual(1);
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
    const glow = layers.find((layer) => layer.id === "result-line-glow") as { layout?: Record<string, unknown>; paint?: Record<string, unknown> } | undefined;
    const line = layers.find((layer) => layer.id === "result-line") as { layout?: Record<string, unknown>; paint?: Record<string, unknown> } | undefined;
    return { glowLayout: glow?.layout, glowPaint: glow?.paint, lineLayout: line?.layout, linePaint: line?.paint };
  });
  expect(style.glowLayout).toMatchObject({
    "line-sort-key": ["case", ["boolean", ["get", "active"], false], 1, 0],
  });
  expect(style.glowPaint).toMatchObject({
    "line-color": ["coalesce", ["get", "lineColor"], ["get", "color"], "#587f78"],
    "line-width": ["case", ["boolean", ["get", "active"], false], 7.6, 2.8],
    "line-opacity": ["case", ["boolean", ["get", "active"], false], 0.22, 0.04],
    "line-blur": 3.2,
  });
  expect(style.lineLayout).toMatchObject({
    "line-sort-key": ["case", ["boolean", ["get", "active"], false], 1, 0],
  });
  expect(style.linePaint).toMatchObject({
    "line-color": ["coalesce", ["get", "lineColor"], ["get", "color"], "#587f78"],
    "line-width": ["case", ["boolean", ["get", "active"], false], 5.8, 2.25],
    "line-opacity": ["case", ["boolean", ["get", "active"], false], 0.96, 0.22],
  });
}

async function expectResultHeaderActions(page: Page): Promise<void> {
  const actions = page.locator(".result-header-actions");
  await expect(actions.getByRole("group", { name: "结果地图视图" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "切换结果地图到 2D" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "切换结果地图到 3D" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "分享" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "关闭结果" })).toBeVisible();
  const state = await actions.evaluate((node) => {
    const rect = (node as HTMLElement).getBoundingClientRect();
    const toolbar = node.querySelector(".result-map-toolbar") as HTMLElement | null;
    const switchBase = node.querySelector(".result-map-toolbar-surface .liquid-glass-content") as HTMLElement | null;
    const switchButton = node.querySelector(".result-map-view-switch button") as HTMLElement | null;
    const copyButton = node.querySelector('[title="分享诊断链接"]') as HTMLElement | null;
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
    const copyButton = document.querySelector('[title="分享诊断链接"]') as HTMLElement | null;
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
  expected: { labels: string[]; lineLength?: number; minLineLength?: number; maxLineLngSpan: number; maxFitLngSpan?: number },
): Promise<void> {
  await expect
    .poll(async () => resultRouteState(page))
    .toMatchObject({
      labels: expected.labels,
    });

  const state = await resultRouteState(page);
  if (expected.lineLength !== undefined) {
    expect(state.lineLength).toBe(expected.lineLength);
  } else {
    expect(state.lineLength).toBeGreaterThanOrEqual(expected.minLineLength ?? 0);
  }
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
          routeGroups?: Array<{ label?: string; routeId?: string }>;
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
    const labels = (data?.routeGroups || [])
      .filter((group) => !activeRouteId || group.routeId === activeRouteId)
      .map((group) => String(group.label));
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

async function expectResultSelectedRouteNode(page: Page, nodeId: string | null): Promise<void> {
  await expect
    .poll(async () =>
      page.locator(".result-map").evaluate((node) => {
        return (node as HTMLElement & { __globalTraceSelectedRouteNodeId?: string | null }).__globalTraceSelectedRouteNodeId || null;
      }),
    )
    .toBe(nodeId);
}

async function expectResultMapPopup(page: Page, text: string): Promise<void> {
  await expect(page.locator(".result-map-popup").getByText(text, { exact: true })).toBeVisible();
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
  const resultMap = page.locator(".result-map");
  await resultMap.scrollIntoViewIfNeeded();
  const nodeButton = resultMap.locator(`button[data-route-node-id="${nodeId}"]`);
  if (!(await nodeButton.isVisible())) {
    const groupId = await resultMapRouteNodeGroupId(page, nodeId);
    if (!groupId) throw new Error(`route node ${nodeId} is not present in result map data`);
    const groupButton = resultMap.locator(`button[data-route-group-id="${groupId}"]`).first();
    await groupButton.hover();
    if (!(await nodeButton.isVisible())) await groupButton.click();
    await expect(nodeButton).toBeVisible();
  }
  await expect
    .poll(async () => {
      await nodeButton.click();
      return page.locator(".result-map-popup").count();
    })
    .toBeGreaterThan(0);
}

async function clickMapCoordinate(page: Page, coordinate: [number, number]): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expectMapProjectsCoordinateInsideCanvas(page, coordinate);
    const point = await mapScreenPoint(page, coordinate);
    await page.mouse.click(point.x, point.y);
    if ((await page.getByLabel("probe map").getByText(/^已选择 /).count()) > 0) return;
    await page.waitForTimeout(250);
  }
}

async function resultMapRouteNodeGroupId(page: Page, nodeId: string): Promise<string | null> {
  return page.locator(".result-map").evaluate((node, nextNodeId) => {
    const data = (
      node as HTMLElement & {
        __globalTraceResultData?: { routeNodes?: Array<{ nodeId?: string; groupId?: string }> };
      }
    ).__globalTraceResultData;
    return data?.routeNodes?.find((item) => item.nodeId === nextNodeId)?.groupId || null;
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

function makeShanghaiSmokeProbes(): GlobalpingProbe[] {
  return makeChinaSmokeProbes(4).map((probe, index) => ({
    ...probe,
    location: {
      ...probe.location,
      city: ["Shanghai", "Beijing", "Guangzhou", "Shenzhen"][index] || probe.location.city,
    },
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

function multiProbeTraceResult(count: number): TraceResultResponse {
  const result = traceResult("finished");
  const base = result.results[0];
  if (!base) return result;
  const cities = ["Falkenstein", "Helsinki", "Roubaix", "Nuremberg", "Buffalo", "Frankfurt", "Raleigh", "Arhus", "Tokyo", "Singapore"];
  result.probesCount = count;
  result.results = Array.from({ length: count }, (_, index) => ({
    ...base,
    id: `probe-${index + 1}`,
    probe: {
      ...base.probe,
      city: cities[index] || `Probe ${index + 1}`,
      asn: [24940, 24940, 16276, 197540, 36352, 31898, 174, 39642, 2516, 13335][index] || 64500 + index,
      latitude: base.probe.latitude + index * 0.1,
      longitude: base.probe.longitude + index * 0.1,
    },
  }));
  return result;
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
