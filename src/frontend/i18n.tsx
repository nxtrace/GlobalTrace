import { createContext, useContext, useEffect, type ReactNode } from "react";

export type Locale = "zh-CN" | "en-US";

export const LOCALE_STORAGE_KEY = "globaltrace.locale";

export interface FilterChipLabels {
  country: string;
  city: string;
  type: string;
  scope: string;
}

export interface Messages {
  locale: Locale;
  metaDescription: string;
  languageName: string;
  switchLanguage: string;
  brandSubtitle: string;
  theme: (label: string) => string;
  advancedParams: string;
  openAdvancedParams: string;
  resetFilters: string;
  home: string;
  basicParams: string;
  switchIpVersion: string;
  targetPlaceholder: string;
  target: string;
  startTrace: string;
  protocol: string;
  port: string;
  auto: string;
  currentFilters: string;
  exactFilters: string;
  countryRegion: string;
  city: string;
  networkType: string;
  aboutGlobalTrace: string;
  about: string;
  probeStatus: (status: "loading" | "ready" | "error", visible: number, total: number) => string;
  filterChipLabels: FilterChipLabels;
  uiEffects: string;
  liquidGlassEffect: string;
  liquidGlassIntensity: string;
  resultOrder: string;
  mapFirst: string;
  tableFirst: string;
  rememberLocal: string;
  globalpingTokenPlaceholder: string;
  rememberGlobalping: string;
  tokenStatus: (provider: "Globalping" | "NextTrace", saved: boolean, remembered: boolean) => string;
  saveProvider: (provider: "Globalping" | "NextTrace") => string;
  clearProvider: (provider: "Globalping" | "NextTrace") => string;
  save: string;
  clear: string;
  getNexttraceToken: string;
  nexttraceTokenPlaceholder: string;
  rememberNexttrace: string;
  suggestionList: string;
  closeTitle: (title: string) => string;
  quotaLoading: string;
  quotaUnavailable: string;
  quotaAvailable: (remaining: number, limit: number, actor: string) => string;
  currentIp: string;
  nexttraceDirectEnabled: string;
  globalpingCreditsControl: string;
  initFailed: string;
  measurementLoadFailed: string;
  traceCreateFailed: string;
  addedProbe: (label: string, asn: string | number) => string;
  noBoxProbes: string;
  addedBox: (count: number) => string;
  addedBoxCapped: (count: number) => string;
  workspaceTitle: string;
  viewResult: string;
  aboutTitle: string;
  resultsTitle: string;
  loadingAbout: string;
  loadingProbeMap: string;
  loadingMap: string;
  loadingResults: string;
  loadingResultsDescription: string;
  readingResults: string;
  readingMeasurement: string;
  readingMeasurementDescription: string;
  resultOrderPrompt: string;
  resultOrderHint: string;
  traceStillRunning: string;
  invalidGlobalpingParams: (message: string) => string;
  probeMap: string;
  boxSelectProbes: string;
  dragSelect: string;
  boxSelect: string;
  dragSelectHint: string;
  cancelMapFilter: string;
  cancel: string;
  clearMapFilterHint: string;
  noMatchingProbes: string;
  relaxProbeFilters: string;
  closeProbeCandidates: string;
  probeCandidates: (location: string) => string;
  probeAsnCandidates: string;
  onlineProbes: string;
  location: string;
  select: string;
  selectProbeTitle: (magic: string) => string;
  selectProbeLabel: (location: string, asn: string | number) => string;
  noTableProbes: string;
  tableLimitNote: (count: number) => string;
  tableSubtitle: (status: "loading" | "ready" | "error", visible: number, total: number) => string;
  waitingTrace: string;
  waitingTraceDescription: string;
  noProbeResult: string;
  closeResult: string;
  targetLatencyLoss: (latency: string, loss: string) => string;
  pollingState: string;
  resultMapView: string;
  switchResultMap2d: string;
  switchResultMap3d: string;
  shareTraceLink: string;
  copied: string;
  share: string;
  failedProbe: (rawOutput: string) => string;
  noHopData: string;
  focusTtl: (ttl: number) => string;
  ttlNoGeo: (ttl: number) => string;
  packetStatus: (ttl: number, count: number, loss: string) => string;
  targetPacketUnavailable: string;
  targetPacketStatus: (count: number, loss: string) => string;
  expandTtl: (label: string) => string;
  selectTtl: (label: string) => string;
  viewPeerAs: (ip: string) => string;
  enrichmentLabel: (status: "complete" | "partial" | "skipped") => string;
  sourceCode: string;
  backToTrace: string;
  aboutIntro: string;
  aboutGlobalping: string;
  aboutNexttrace: string;
  openSourceLicense: string;
  licenseText: string;
  relatedLinks: string;
  backgroundCredit: (title: string, copyright: string) => string;
  bingDailyImage: string;
}

const zhCN: Messages = {
  locale: "zh-CN",
  metaDescription: "GlobalTrace 使用 Globalping 全球 Probe 发起路由追踪，并结合 NextTrace 数据增强跳点地理位置与网络归属信息。",
  languageName: "中文",
  switchLanguage: "切换到 English",
  brandSubtitle: "全球路由追踪",
  theme: (label) => `主题：${label}`,
  advancedParams: "高级参数",
  openAdvancedParams: "打开高级参数",
  resetFilters: "重置筛选",
  home: "返回首页",
  basicParams: "基础参数",
  switchIpVersion: "切换 IPv4 / IPv6",
  targetPlaceholder: "目标 IP 或域名，如 1.1.1.1、github.com",
  target: "目标",
  startTrace: "开始网络路径诊断",
  protocol: "协议",
  port: "端口",
  auto: "自动",
  currentFilters: "当前筛选",
  exactFilters: "精确筛选",
  countryRegion: "国家/地区",
  city: "城市",
  networkType: "网络类型",
  aboutGlobalTrace: "关于 GlobalTrace",
  about: "关于",
  probeStatus: (status, visible, total) => {
    if (status === "loading") return "probes 加载中";
    if (status === "error") return "probes 读取失败";
    return `${visible} / ${total} probes 匹配`;
  },
  filterChipLabels: { country: "国家/地区", city: "城市", type: "类型", scope: "范围" },
  uiEffects: "界面效果",
  liquidGlassEffect: "液态玻璃效果",
  liquidGlassIntensity: "液态玻璃强度",
  resultOrder: "结果页面显示顺序",
  mapFirst: "地图优先",
  tableFirst: "表格优先",
  rememberLocal: "记住到本机",
  globalpingTokenPlaceholder: "可选：使用自己的 Globalping Token",
  rememberGlobalping: "记住 Globalping 到本机",
  tokenStatus: (provider, saved, remembered) => saved ? `${provider} Token ${remembered ? "已记住到本机浏览器" : "仅当前会话可用"}` : `未使用 ${provider} Token`,
  saveProvider: (provider) => `保存 ${provider}`,
  clearProvider: (provider) => `清除 ${provider}`,
  save: "保存",
  clear: "清除",
  getNexttraceToken: "获取 NextTrace API Token",
  nexttraceTokenPlaceholder: "可选：直连 NextTrace enrichment",
  rememberNexttrace: "记住 NextTrace 到本机",
  suggestionList: "候选列表",
  closeTitle: (title) => `关闭${title}`,
  quotaLoading: "诊断额度读取中",
  quotaUnavailable: "诊断额度暂不可用",
  quotaAvailable: (remaining, limit, actor) => `可创建诊断 ${remaining}/${limit}（${actor}）`,
  currentIp: "当前 IP",
  nexttraceDirectEnabled: "NextTrace API Token 直连已启用",
  globalpingCreditsControl: "Globalping credits 控制诊断创建",
  initFailed: "初始化失败",
  measurementLoadFailed: "加载 measurement 失败",
  traceCreateFailed: "创建 trace 失败",
  addedProbe: (label, asn) => `已添加 ${label} · AS${asn}`,
  noBoxProbes: "框选范围内没有可用 probe",
  addedBox: (count) => `已添加框选 ${count} 个 probes`,
  addedBoxCapped: (count) => `已添加框选 ${count} 个 probes，保留最近 10 个`,
  workspaceTitle: "网络路径诊断",
  viewResult: "查看结果",
  aboutTitle: "关于 GlobalTrace",
  resultsTitle: "诊断结果",
  loadingAbout: "正在加载关于页面",
  loadingProbeMap: "正在加载 probe map",
  loadingMap: "正在加载地图",
  loadingResults: "正在加载结果视图",
  loadingResultsDescription: "地图与 hop 明细加载完成后会自动显示。",
  readingResults: "读取诊断结果",
  readingMeasurement: "正在读取 measurement",
  readingMeasurementDescription: "正在读取 Globalping measurement，完成后会自动展示结果。",
  resultOrderPrompt: "结果页面显示顺序",
  resultOrderHint: "后续如果还想改，可以在高级参数中修改。",
  traceStillRunning: "measurement 仍在运行，请稍后通过分享 URL 重新打开。",
  invalidGlobalpingParams: (message) => `Globalping 请求参数无效：${message} 请检查目标、筛选条件或高级参数。`,
  probeMap: "probe map",
  boxSelectProbes: "框选 probes",
  dragSelect: "拖拽选择",
  boxSelect: "框选",
  dragSelectHint: "拖拽地图区域生成 magic probe 筛选",
  cancelMapFilter: "取消地图筛选",
  cancel: "取消",
  clearMapFilterHint: "清除地图点选或框选生成的 probe 筛选",
  noMatchingProbes: "没有匹配的在线 probe",
  relaxProbeFilters: "放宽国家/地区、城市、ASN、network 或 tag 条件。",
  closeProbeCandidates: "关闭 probe 候选列表",
  probeCandidates: (location) => `${location} probe candidates`,
  probeAsnCandidates: "probe ASN candidates",
  onlineProbes: "在线 probes",
  location: "位置",
  select: "select",
  selectProbeTitle: (magic) => `选择 ${magic}`,
  selectProbeLabel: (location, asn) => `选择 ${location} AS${asn}`,
  noTableProbes: "当前筛选没有匹配在线 probe。",
  tableLimitNote: (count) => `已显示前 ${count} 条；运行时按 probes 上限选择。`,
  tableSubtitle: (status, visible, total) => {
    if (status === "loading") return "正在读取 Globalping probes";
    if (status === "error") return "读取失败，保留当前筛选";
    return `${visible} 匹配 / ${total} 在线`;
  },
  waitingTrace: "等待网络路径诊断",
  waitingTraceDescription: "创建 measurement 后，这里显示 probe、route summary、hop 明细和原始输出。",
  noProbeResult: "暂无 probe result。",
  closeResult: "关闭结果",
  targetLatencyLoss: (latency, loss) => `目标延迟 ${latency}，目标丢包 ${loss}`,
  pollingState: "measurement 正在运行，轮询完成后会补齐 hop 和 GeoIP。",
  resultMapView: "结果地图视图",
  switchResultMap2d: "切换结果地图到 2D",
  switchResultMap3d: "切换结果地图到 3D",
  shareTraceLink: "分享诊断链接",
  copied: "已复制",
  share: "分享",
  failedProbe: (rawOutput) => `该 probe 失败：${rawOutput}`,
  noHopData: "该 probe 还没有 hop 数据。",
  focusTtl: (ttl) => `定位 TTL ${ttl}`,
  ttlNoGeo: (ttl) => `TTL ${ttl} 没有可定位 GeoIP`,
  packetStatus: (ttl, count, loss) => `TTL ${ttl} 包状态 ${count} 个，丢包 ${loss}`,
  targetPacketUnavailable: "目标包状态不可用",
  targetPacketStatus: (count, loss) => `目标包状态 ${count} 个，丢包 ${loss}`,
  expandTtl: (label) => `展开 TTL ${label}`,
  selectTtl: (label) => `选择 TTL ${label}`,
  viewPeerAs: (ip) => `在 peer.as 查看 ${ip}`,
  enrichmentLabel: (status) => status === "complete" ? "完成" : status === "partial" ? "部分完成" : "跳过",
  sourceCode: "源码",
  backToTrace: "返回诊断",
  aboutIntro: "GlobalTrace 是一个 Globalping x NextTrace 的开源项目，借助 Globalping 遍布全球的 Probe 发起路由追踪，并结合 NextTrace 骨干网 IP 数据库增强地理位置与网络归属信息。",
  aboutGlobalping: "使用 Globalping 的全球 Probe 网络，从不同地区发起 MTR measurement。",
  aboutNexttrace: "Worker 只按 Globalping measurement ID 拉取结果，并使用 NextTrace / NTrace 数据补充 hop。",
  openSourceLicense: "开源协议",
  licenseText: "GlobalTrace 以 GPL-3.0-or-later 开源发布。",
  relatedLinks: "相关链接",
  backgroundCredit: (title, copyright) => `背景：${title} · ${copyright}`,
  bingDailyImage: "Bing 每日美景",
};

const enUS: Messages = {
  ...zhCN,
  locale: "en-US",
  metaDescription: "GlobalTrace runs traceroutes from Globalping probes worldwide and enriches hops with NextTrace geolocation and network ownership data.",
  languageName: "English",
  switchLanguage: "Switch to 中文",
  brandSubtitle: "Global route tracing",
  theme: (label) => `Theme: ${label}`,
  advancedParams: "Advanced settings",
  openAdvancedParams: "Open advanced settings",
  resetFilters: "Reset filters",
  home: "Back home",
  basicParams: "Basic parameters",
  switchIpVersion: "Switch IPv4 / IPv6",
  targetPlaceholder: "Target IP or domain, such as 1.1.1.1 or github.com",
  target: "Target",
  startTrace: "Start network path diagnosis",
  protocol: "Protocol",
  port: "Port",
  auto: "Auto",
  currentFilters: "Current filters",
  exactFilters: "Exact filters",
  countryRegion: "Country/Region",
  city: "City",
  networkType: "Network type",
  aboutGlobalTrace: "About GlobalTrace",
  about: "About",
  probeStatus: (status, visible, total) => {
    if (status === "loading") return "Loading probes";
    if (status === "error") return "Failed to load probes";
    return `${visible} / ${total} probes matched`;
  },
  filterChipLabels: { country: "Country/Region", city: "City", type: "Type", scope: "Scope" },
  uiEffects: "Interface effects",
  liquidGlassEffect: "Liquid glass effect",
  liquidGlassIntensity: "Liquid glass intensity",
  resultOrder: "Result page display order",
  mapFirst: "Map first",
  tableFirst: "Table first",
  rememberLocal: "Remember on this device",
  globalpingTokenPlaceholder: "Optional: use your own Globalping Token",
  rememberGlobalping: "Remember Globalping locally",
  tokenStatus: (provider, saved, remembered) => saved ? `${provider} Token ${remembered ? "is saved in this browser" : "is available for this session"}` : `No ${provider} Token in use`,
  saveProvider: (provider) => `Save ${provider}`,
  clearProvider: (provider) => `Clear ${provider}`,
  save: "Save",
  clear: "Clear",
  getNexttraceToken: "Get NextTrace API Token",
  nexttraceTokenPlaceholder: "Optional: direct NextTrace enrichment",
  rememberNexttrace: "Remember NextTrace locally",
  suggestionList: "Suggestions",
  closeTitle: (title) => `Close ${title}`,
  quotaLoading: "Loading diagnosis quota",
  quotaUnavailable: "Diagnosis quota unavailable",
  quotaAvailable: (remaining, limit, actor) => `Diagnoses available ${remaining}/${limit} (${actor})`,
  currentIp: "current IP",
  nexttraceDirectEnabled: "NextTrace API Token direct mode enabled",
  globalpingCreditsControl: "Globalping credits control diagnosis creation",
  initFailed: "Initialization failed",
  measurementLoadFailed: "Failed to load measurement",
  traceCreateFailed: "Failed to create trace",
  addedProbe: (label, asn) => `Added ${label} · AS${asn}`,
  noBoxProbes: "No available probes in the selected area",
  addedBox: (count) => `Added ${count} selected probes`,
  addedBoxCapped: (count) => `Added ${count} selected probes, keeping the latest 10`,
  workspaceTitle: "Network path diagnosis",
  viewResult: "View result",
  aboutTitle: "About GlobalTrace",
  resultsTitle: "Diagnosis result",
  loadingAbout: "Loading about page",
  loadingProbeMap: "Loading probe map",
  loadingMap: "Loading map",
  loadingResults: "Loading result view",
  loadingResultsDescription: "The map and hop details will appear after they finish loading.",
  readingResults: "Reading diagnosis result",
  readingMeasurement: "Reading measurement",
  readingMeasurementDescription: "Reading the Globalping measurement. Results will appear automatically when ready.",
  resultOrderPrompt: "Result page display order",
  resultOrderHint: "You can change this later in advanced settings.",
  traceStillRunning: "The measurement is still running. Reopen it later with the share URL.",
  invalidGlobalpingParams: (message) => `Globalping request parameters are invalid: ${message} Check the target, filters, or advanced settings.`,
  probeMap: "probe map",
  boxSelectProbes: "Box select probes",
  dragSelect: "Drag select",
  boxSelect: "Box select",
  dragSelectHint: "Drag across the map to create a magic probe filter",
  cancelMapFilter: "Cancel map filter",
  cancel: "Cancel",
  clearMapFilterHint: "Clear the probe filter created from map point or box selection",
  noMatchingProbes: "No matching online probes",
  relaxProbeFilters: "Relax country/region, city, ASN, network, or tag filters.",
  closeProbeCandidates: "Close probe candidate list",
  probeCandidates: (location) => `${location} probe candidates`,
  probeAsnCandidates: "probe ASN candidates",
  onlineProbes: "Online probes",
  location: "Location",
  select: "select",
  selectProbeTitle: (magic) => `Select ${magic}`,
  selectProbeLabel: (location, asn) => `Select ${location} AS${asn}`,
  noTableProbes: "No online probes match the current filters.",
  tableLimitNote: (count) => `Showing the first ${count}; runtime selection follows the probe limit.`,
  tableSubtitle: (status, visible, total) => {
    if (status === "loading") return "Loading Globalping probes";
    if (status === "error") return "Failed to load; keeping current filters";
    return `${visible} matched / ${total} online`;
  },
  waitingTrace: "Waiting for network path diagnosis",
  waitingTraceDescription: "After a measurement is created, probe, route summary, hop details, and raw output appear here.",
  noProbeResult: "No probe result yet.",
  closeResult: "Close result",
  targetLatencyLoss: (latency, loss) => `Target latency ${latency}, target loss ${loss}`,
  pollingState: "The measurement is running. Hop and GeoIP data will be filled in after polling completes.",
  resultMapView: "Result map view",
  switchResultMap2d: "Switch result map to 2D",
  switchResultMap3d: "Switch result map to 3D",
  shareTraceLink: "Share diagnosis link",
  copied: "Copied",
  share: "Share",
  failedProbe: (rawOutput) => `This probe failed: ${rawOutput}`,
  noHopData: "This probe does not have hop data yet.",
  focusTtl: (ttl) => `Focus TTL ${ttl}`,
  ttlNoGeo: (ttl) => `TTL ${ttl} has no locatable GeoIP`,
  packetStatus: (ttl, count, loss) => `TTL ${ttl} packet status ${count}, loss ${loss}`,
  targetPacketUnavailable: "Target packet status unavailable",
  targetPacketStatus: (count, loss) => `Target packet status ${count}, loss ${loss}`,
  expandTtl: (label) => `Expand TTL ${label}`,
  selectTtl: (label) => `Select TTL ${label}`,
  viewPeerAs: (ip) => `View ${ip} on peer.as`,
  enrichmentLabel: (status) => status === "complete" ? "complete" : status === "partial" ? "partial" : "skipped",
  sourceCode: "Source",
  backToTrace: "Back to trace",
  aboutIntro: "GlobalTrace is an open-source Globalping x NextTrace project. It runs traceroutes from Globalping probes around the world and enriches geolocation and network ownership with the NextTrace backbone IP database.",
  aboutGlobalping: "Use Globalping's global probe network to run MTR measurements from different regions.",
  aboutNexttrace: "The Worker only fetches results by Globalping measurement ID, then uses NextTrace / NTrace data to enrich hops.",
  openSourceLicense: "Open source license",
  licenseText: "GlobalTrace is released under GPL-3.0-or-later.",
  relatedLinks: "Related links",
  backgroundCredit: (title, copyright) => `Background: ${title} · ${copyright}`,
  bingDailyImage: "Bing daily image",
};

export const messagesByLocale: Record<Locale, Messages> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

const I18nContext = createContext<Messages>(zhCN);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const messages = messagesByLocale[locale];
  useEffect(() => {
    document.documentElement.lang = messages.locale;
    document.querySelector('meta[name="description"]')?.setAttribute("content", messages.metaDescription);
  }, [messages]);
  return <I18nContext.Provider value={messages}>{children}</I18nContext.Provider>;
}

export function useI18n(): Messages {
  return useContext(I18nContext);
}

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "zh-cn" || normalized.startsWith("zh")) return "zh-CN";
  if (normalized === "en-us" || normalized.startsWith("en")) return "en-US";
  return null;
}

export function detectBrowserLocale(): Locale {
  const languages = typeof navigator === "undefined" ? [] : [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ];
  return languages.some((language) => normalizeLocale(language) === "zh-CN") ? "zh-CN" : "en-US";
}

export function readStoredLocale(): Locale {
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)) ?? detectBrowserLocale();
  } catch {
    return detectBrowserLocale();
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Locale persistence is best-effort.
  }
}
