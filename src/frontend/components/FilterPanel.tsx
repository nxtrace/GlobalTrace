import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Filter,
  Info,
  Monitor,
  Moon,
  Play,
  RotateCcw,
  Settings,
  Sun,
} from "lucide-react";
import {
  type FilterChip,
  type ProbeFilterSuggestions,
} from "../../shared/filters";
import type { TraceFilters, TraceProtocol } from "../../shared/types";
import type { ResultContentOrder } from "./mapProjection";
import { themeModeLabel, type ThemeMode } from "../theme";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { GlassOverlay } from "./GlassOverlay";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Surface } from "./ui/surface";
import { Switch } from "./ui/switch";
import { AdvancedParamsPanel } from "./filter-panel/AdvancedParamsPanel";
import { MagicSuggestionTextarea, SuggestionInput } from "./filter-panel/suggestions";
import { handleSpaLinkClick } from "./spaNavigation";

export type IpVersionSelection = 4 | 6;

export interface FilterPanelProps {
  target: string;
  protocol: TraceProtocol;
  ipVersion: IpVersionSelection;
  port: string;
  packets: number;
  limit: number;
  filters: TraceFilters;
  filterSuggestions?: ProbeFilterSuggestions;
  chips: FilterChip[];
  visibleProbes: number;
  totalProbes: number;
  probesStatus: "loading" | "ready" | "error";
  selectionNotice: string;
  loading: boolean;
  canSubmit: boolean;
  globalpingTokenDraft: string;
  globalpingTokenSaved: boolean;
  globalpingTokenRemembered: boolean;
  nexttraceTokenDraft: string;
  nexttraceTokenSaved: boolean;
  nexttraceTokenRemembered: boolean;
  themeMode: ThemeMode;
  liquidGlassEnabled: boolean;
  liquidGlassIntensity: number;
  resultContentOrder: ResultContentOrder;
  onTargetChange: (value: string) => void;
  onProtocolChange: (value: TraceProtocol) => void;
  onIpVersionChange: (value: IpVersionSelection) => void;
  onPortChange: (value: string) => void;
  onPacketsChange: (value: number) => void;
  onLimitChange: (value: number) => void;
  onFiltersChange: (value: TraceFilters) => void;
  onGlobalpingTokenDraftChange: (token: string) => void;
  onSaveGlobalpingToken: () => void;
  onClearGlobalpingToken: () => void;
  onGlobalpingTokenRememberedChange: (remembered: boolean) => void;
  onNexttraceTokenDraftChange: (token: string) => void;
  onSaveNexttraceToken: () => void;
  onClearNexttraceToken: () => void;
  onNexttraceTokenRememberedChange: (remembered: boolean) => void;
  onCycleThemeMode: () => void;
  onLiquidGlassEnabledChange: (enabled: boolean) => void;
  onLiquidGlassIntensityChange: (intensity: number) => void;
  onResultContentOrderChange: (value: ResultContentOrder) => void;
  onOpenAdvancedParams?: () => void;
  onNavigateHome: () => void;
  onNavigateAbout: () => void;
  onReset: () => void;
  onSubmit: () => void;
}

const EMPTY_FILTER_SUGGESTIONS: ProbeFilterSuggestions = {
  countries: [],
  cities: [],
  asns: [],
  networks: [],
  tags: [],
  magicStrings: [],
};
const EXACT_FILTERS_DESKTOP_QUERY = "(min-width: 821px)";

function readExactFiltersDefaultOpen(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return true;
  return window.matchMedia(EXACT_FILTERS_DESKTOP_QUERY).matches;
}

export function FilterPanel(props: FilterPanelProps) {
  const filterSuggestions = props.filterSuggestions ?? EMPTY_FILTER_SUGGESTIONS;
  const [advancedParamsOpen, setAdvancedParamsOpen] = useState(false);
  const exactFiltersTouchedRef = useRef(false);
  const [exactFiltersOpen, setExactFiltersOpen] = useState(
    readExactFiltersDefaultOpen,
  );

  const openAdvancedParams = () => {
    props.onOpenAdvancedParams?.();
    setAdvancedParamsOpen(true);
  };

  const markExactFiltersTouched = () => {
    exactFiltersTouchedRef.current = true;
  };

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
    const mediaQuery = window.matchMedia(EXACT_FILTERS_DESKTOP_QUERY);
    const updateDefault = (matches: boolean) => {
      if (!exactFiltersTouchedRef.current) setExactFiltersOpen(matches);
    };
    const onChange = (event: MediaQueryListEvent) =>
      updateDefault(event.matches);

    updateDefault(mediaQuery.matches);
    mediaQuery.addEventListener?.("change", onChange);
    mediaQuery.addListener?.(onChange);
    return () => {
      mediaQuery.removeEventListener?.("change", onChange);
      mediaQuery.removeListener?.(onChange);
    };
  }, []);

  const setFilter = (key: keyof TraceFilters, value: string | boolean) => {
    const nextValue = cleanFilterValue(value);
    if (key === "magic") {
      props.onFiltersChange({
        magic: typeof nextValue === "string" ? nextValue : "world",
      });
      return;
    }
    props.onFiltersChange({
      ...props.filters,
      magic: undefined,
      [key]: nextValue,
    });
  };

  return (
    <Surface asChild className="filter-panel" aria-label="trace filters">
      <aside>
        <div className="filter-panel-scroll">
          <div className="panel-title-row">
            <a
              className="brand-home-link"
              href="/"
              onClick={(event) => handleSpaLinkClick(event, props.onNavigateHome)}
              aria-label="返回首页"
            >
              <h1>GlobalTrace</h1>
              <p>全球路由追踪</p>
            </a>
            <div className="panel-title-actions">
              <LiquidGlassSurface
                variant="iconButton"
                interactive
                className="panel-action-surface"
                onClick={props.onCycleThemeMode}
                title={`主题：${themeModeLabel(props.themeMode)}`}
                ariaLabel={`主题：${themeModeLabel(props.themeMode)}`}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="panel-action-button"
                  asChild
                >
                  <span>
                    <ThemeIcon mode={props.themeMode} />
                  </span>
                </Button>
              </LiquidGlassSurface>
              <LiquidGlassSurface
                variant="iconButton"
                interactive
                className="panel-action-surface"
                onClick={openAdvancedParams}
                title="高级参数"
                ariaLabel="打开高级参数"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="panel-action-button"
                  asChild
                >
                  <span>
                    <Settings size={18} />
                  </span>
                </Button>
              </LiquidGlassSurface>
              <LiquidGlassSurface
                variant="iconButton"
                interactive
                className="panel-action-surface"
                onClick={props.onReset}
                title="重置筛选"
                ariaLabel="重置筛选"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="panel-action-button"
                  asChild
                >
                  <span>
                    <RotateCcw size={18} />
                  </span>
                </Button>
              </LiquidGlassSurface>
            </div>
          </div>

          <Surface asChild variant="flat" className="primary-controls-surface">
            <section
              className="control-section primary-controls"
              aria-label="基础参数"
            >
              <div className="target-command-row">
                <Button
                  variant="glass"
                  size="sm"
                  type="button"
                  className="target-ip-button"
                  onClick={() =>
                    props.onIpVersionChange(props.ipVersion === 4 ? 6 : 4)
                  }
                  title="切换 IPv4 / IPv6"
                >
                  {props.ipVersion === 4 ? "IPv4" : "IPv6"}
                </Button>
                <Input
                  className="target-command-input border-0 bg-transparent shadow-none backdrop-blur-none hover:bg-transparent focus-visible:ring-0"
                  value={props.target}
                  onChange={(event) => props.onTargetChange(event.target.value)}
                  placeholder="目标 IP 或域名，如 1.1.1.1、github.com"
                  maxLength={253}
                  aria-label="目标"
                />
                <LiquidGlassSurface
                  variant="button"
                  interactive
                  disabled={props.loading || !props.canSubmit}
                  className="run-action-surface target-run-surface"
                  onClick={props.onSubmit}
                  ariaLabel="开始网络路径诊断"
                >
                  <Button
                    variant="primary"
                    size="icon"
                    className="primary-action target-submit-button"
                    asChild
                  >
                    <span>
                      <Play size={18} />
                    </span>
                  </Button>
                </LiquidGlassSurface>
              </div>

              <div className="parameter-pill-grid">
                <div className="parameter-pill protocol-pill" aria-label="协议">
                  {(["ICMP", "TCP", "UDP"] as TraceProtocol[]).map(
                    (protocol) => (
                      <button
                        key={protocol}
                        type="button"
                        className={
                          props.protocol === protocol
                            ? "protocol-pill-option is-active"
                            : "protocol-pill-option"
                        }
                        onClick={() => props.onProtocolChange(protocol)}
                        aria-pressed={props.protocol === protocol}
                      >
                        {protocol}
                      </button>
                    ),
                  )}
                </div>
                <label className="parameter-pill port-pill">
                  <span className="parameter-pill-label">端口</span>
                  <input
                    className="parameter-pill-control port-pill-value"
                    type="text"
                    value={props.port}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="自动"
                    aria-label="端口"
                    title="端口，留空自动"
                    onChange={(event) =>
                      props.onPortChange(
                        sanitizeNumericText(event.currentTarget.value),
                      )
                    }
                  />
                </label>
                <label className="parameter-pill packets-pill">
                  <span className="parameter-pill-label">Packets</span>
                  <input
                    className="parameter-pill-control numeric-pill-value"
                    type="text"
                    value={props.packets}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="Packets"
                    onChange={(event) =>
                      props.onPacketsChange(
                        clampNumericText(event.currentTarget.value, 1, 16),
                      )
                    }
                  />
                </label>

                <label className="parameter-pill limit-pill">
                  <span className="parameter-pill-label">Limit</span>
                  <input
                    className="parameter-pill-control numeric-pill-value"
                    type="text"
                    value={props.limit}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="Limit"
                    onChange={(event) =>
                      props.onLimitChange(
                        clampNumericText(event.currentTarget.value, 1, 10),
                      )
                    }
                  />
                </label>
                <label className="parameter-pill magic-pill">
                  <MagicSuggestionTextarea
                    value={visibleMagicValue(props.filters.magic)}
                    options={filterSuggestions.magicStrings}
                    onChange={(value) => setFilter("magic", value)}
                  />
                </label>
              </div>
            </section>
          </Surface>

          <LiquidGlassSurface
            variant="panel"
            fullWidth
            className="filter-summary-surface"
          >
            <section className="filter-summary" aria-label="当前筛选">
              <div className="summary-title">
                <Filter size={16} />
                <span>当前筛选</span>
              </div>
              <div className="chip-row" data-testid="filter-chips">
                {props.chips.map((chip) =>
                  chip.key === "magic" ? (
                    <span className="filter-magic-summary" key={chip.key}>
                      <span className="filter-chip-value">{chip.value}</span>
                    </span>
                  ) : (
                    <Badge className="filter-chip" key={chip.key}>
                      <strong>{chip.label}</strong>
                      <span className="filter-chip-value">{chip.value}</span>
                    </Badge>
                  ),
                )}
              </div>
              <div className="probe-match-row">
                <span>
                  {probeStatusText(
                    props.probesStatus,
                    props.visibleProbes,
                    props.totalProbes,
                  )}
                </span>
                {props.selectionNotice && (
                  <span className="notice-text">{props.selectionNotice}</span>
                )}
              </div>
            </section>
          </LiquidGlassSurface>

          <Surface asChild variant="flat">
            <details
              className="advanced-panel"
              open={exactFiltersOpen}
              onToggle={(event) =>
                setExactFiltersOpen(event.currentTarget.open)
              }
            >
              <summary
                onClick={markExactFiltersTouched}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    markExactFiltersTouched();
                }}
              >
                <Filter size={16} />
                精确筛选
              </summary>

              <div className="advanced-panel-body">
                <div className="control-grid">
                  <label className="field-label">
                    <span>国家/地区</span>
                    <SuggestionInput
                      label="国家/地区"
                      value={props.filters.country || ""}
                      options={filterSuggestions.countries}
                      onChange={(value) => setFilter("country", value)}
                    />
                  </label>
                  <label className="field-label">
                    <span>城市</span>
                    <SuggestionInput
                      label="城市"
                      value={props.filters.city || ""}
                      options={filterSuggestions.cities}
                      onChange={(value) => setFilter("city", value)}
                    />
                  </label>
                  <label className="field-label">
                    <span>ASN</span>
                    <SuggestionInput
                      label="ASN"
                      value={props.filters.asn || ""}
                      options={filterSuggestions.asns}
                      onChange={(value) => setFilter("asn", value)}
                    />
                  </label>
                  <label className="field-label">
                    <span>network</span>
                    <SuggestionInput
                      label="network"
                      value={props.filters.network || ""}
                      options={filterSuggestions.networks}
                      onChange={(value) => setFilter("network", value)}
                    />
                  </label>
                </div>

                <label className="field-label">
                  <span>tag</span>
                  <SuggestionInput
                    label="tag"
                    value={props.filters.tag || ""}
                    options={filterSuggestions.tags}
                    onChange={(value) => setFilter("tag", value)}
                  />
                </label>

                <div className="segmented" aria-label="网络类型">
                  <label className={props.filters.eyeball ? "selected" : ""}>
                    <span>eyeball</span>
                    <Switch
                      checked={Boolean(props.filters.eyeball)}
                      onCheckedChange={(checked) =>
                        setFilter("eyeball", Boolean(checked))
                      }
                      aria-label="eyeball"
                    />
                  </label>
                  <label className={props.filters.datacenter ? "selected" : ""}>
                    <span>datacenter</span>
                    <Switch
                      checked={Boolean(props.filters.datacenter)}
                      onCheckedChange={(checked) =>
                        setFilter("datacenter", Boolean(checked))
                      }
                      aria-label="datacenter"
                    />
                  </label>
                </div>
              </div>
            </details>
          </Surface>

          <GlassOverlay
            open={advancedParamsOpen}
            title="高级参数"
            size="compact"
            chrome="default"
            placement="center"
            onClose={() => setAdvancedParamsOpen(false)}
          >
            <AdvancedParamsPanel {...props} />
          </GlassOverlay>
        </div>

        <div className="filter-panel-footer" data-testid="filter-panel-footer">
          <LiquidGlassSurface
            variant="panel"
            fullWidth
            className="attribution-glass-surface"
          >
            <div className="attribution-panel">
              <span>
                <span>
                  Powered by{" "}
                  <a
                    href="https://globalping.io/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Globalping
                  </a>{" "}
                  <span className="attribution-separator">×</span>{" "}
                  <a
                    href="https://www.nxtrace.org/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NextTrace
                  </a>
                </span>
              </span>
              <LiquidGlassSurface
                variant="button"
                interactive
                actionRole="none"
                className="liquid-glass-coverage attribution-action-surface"
              >
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  aria-label="关于 GlobalTrace"
                >
                  <a href="/about" onClick={(event) => handleSpaLinkClick(event, props.onNavigateAbout)}>
                    <Info size={15} />
                    关于
                  </a>
                </Button>
              </LiquidGlassSurface>
            </div>
          </LiquidGlassSurface>
        </div>
      </aside>
    </Surface>
  );
}

function sanitizeNumericText(value: string): string {
  return value.replace(/\D/g, "");
}

function clampNumericText(value: string, min: number, max: number): number {
  const digits = sanitizeNumericText(value);
  if (!digits) return min;
  return Math.min(max, Math.max(min, Number(digits)));
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") return <Sun size={18} />;
  if (mode === "dark") return <Moon size={18} />;
  return <Monitor size={18} />;
}

function cleanFilterValue(
  value: string | boolean,
): string | boolean | undefined {
  if (typeof value === "string") {
    return value.trim() ? value : undefined;
  }
  return value || undefined;
}

function visibleMagicValue(value: string | undefined): string {
  return value?.trim().toLowerCase() === "world" ? "" : value || "";
}

function probeStatusText(
  status: "loading" | "ready" | "error",
  visible: number,
  total: number,
): string {
  if (status === "loading") return "probes 加载中";
  if (status === "error") return "probes 读取失败";
  return `${visible} / ${total} probes 匹配`;
}
