import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  Filter,
  Info,
  KeyRound,
  Monitor,
  Moon,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import {
  compactText,
  normalizeAsn,
  type FilterChip,
  type ProbeFilterSuggestions,
} from "../../shared/filters";
import type { TraceFilters, TraceProtocol } from "../../shared/types";
import { themeModeLabel, type ThemeMode } from "../theme";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { GlassOverlay } from "./GlassOverlay";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input, Textarea } from "./ui/input";
import { Surface } from "./ui/surface";
import { Switch } from "./ui/switch";

const NEXTTRACE_API_TOKEN_URL = "https://api.nxtrace.org/v4/api-tokens";

export type IpVersionSelection = 4 | 6;

interface FilterPanelProps {
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
  quotaLabel: string;
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
const MAX_VISIBLE_SUGGESTIONS = 8;
const MAGIC_PLACEHOLDER =
  "Los Angeles+US+AS7922+Comcast, Shanghai+CN+AS4134+China Telecom";
const EXACT_FILTERS_DESKTOP_QUERY = "(min-width: 821px)";

interface IndexedMagicToken {
  lower: string;
  normalizedAsn: string;
}

interface IndexedMagicOption {
  value: string;
  tokens: IndexedMagicToken[];
  includesWorld: boolean;
}

function readExactFiltersDefaultOpen(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return true;
  return window.matchMedia(EXACT_FILTERS_DESKTOP_QUERY).matches;
}

export function FilterPanel(props: FilterPanelProps) {
  const filterSuggestions = props.filterSuggestions ?? EMPTY_FILTER_SUGGESTIONS;
  const globalpingTokenStatusId = useId();
  const nexttraceTokenStatusId = useId();
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
              onClick={(event) => {
                event.preventDefault();
                props.onNavigateHome();
              }}
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
                  <span
                    className="parameter-pill-editable port-pill-value"
                    role="textbox"
                    contentEditable
                    suppressContentEditableWarning
                    inputMode="numeric"
                    data-placeholder="自动"
                    aria-label="端口"
                    onInput={(event) =>
                      props.onPortChange(
                        sanitizeEditableDigits(event.currentTarget),
                      )
                    }
                    onKeyDown={commitEditableOnEnter}
                  >
                    {props.port}
                  </span>
                </label>
                <label className="parameter-pill packets-pill">
                  <span className="parameter-pill-label">Packets</span>
                  <span
                    className="parameter-pill-editable numeric-pill-value"
                    role="textbox"
                    contentEditable
                    suppressContentEditableWarning
                    inputMode="numeric"
                    aria-label="Packets"
                    onInput={(event) =>
                      props.onPacketsChange(
                        clampEditableNumber(event.currentTarget, 1, 16),
                      )
                    }
                    onKeyDown={commitEditableOnEnter}
                  >
                    {props.packets}
                  </span>
                </label>

                <label className="parameter-pill limit-pill">
                  <span className="parameter-pill-label">Limit</span>
                  <span
                    className="parameter-pill-editable numeric-pill-value"
                    role="textbox"
                    contentEditable
                    suppressContentEditableWarning
                    inputMode="numeric"
                    aria-label="Limit"
                    onInput={(event) =>
                      props.onLimitChange(
                        clampEditableNumber(event.currentTarget, 1, 10),
                      )
                    }
                    onKeyDown={commitEditableOnEnter}
                  >
                    {props.limit}
                  </span>
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

                <label className="field-label">
                  <span>tag</span>
                  <SuggestionInput
                    label="tag"
                    value={props.filters.tag || ""}
                    options={filterSuggestions.tags}
                    onChange={(value) => setFilter("tag", value)}
                  />
                </label>
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
            <AdvancedParamsPanel
              globalpingTokenStatusId={globalpingTokenStatusId}
              nexttraceTokenStatusId={nexttraceTokenStatusId}
              {...props}
            />
          </GlassOverlay>
        </div>

        <div className="filter-panel-footer" data-testid="filter-panel-footer">
          <LiquidGlassSurface
            variant="panel"
            fullWidth
            className="run-state-surface"
          >
            <div className="run-state" aria-live="polite">
              <ShieldCheck size={16} />
              <div>
                <strong>
                  {props.nexttraceTokenSaved
                    ? "NextTrace API Token 直连已启用"
                    : "Globalping credits 控制诊断创建"}
                </strong>
                <span>{props.quotaLabel}</span>
              </div>
            </div>
          </LiquidGlassSurface>

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
                onClick={props.onNavigateAbout}
                className="liquid-glass-coverage attribution-action-surface"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  aria-label="关于 GlobalTrace"
                >
                  <Info size={15} />
                  关于
                </Button>
              </LiquidGlassSurface>
            </div>
          </LiquidGlassSurface>
        </div>
      </aside>
    </Surface>
  );
}

function AdvancedParamsPanel({
  globalpingTokenStatusId,
  nexttraceTokenStatusId,
  ...props
}: FilterPanelProps & {
  globalpingTokenStatusId: string;
  nexttraceTokenStatusId: string;
}) {
  const liquidGlassIntensityId = useId();
  return (
    <div className="advanced-params-panel">
      <div className="token-section">
        <div className="summary-title">
          <Monitor size={16} />
          <span>界面效果</span>
        </div>
        <label className="token-remember">
          <span>液态玻璃效果</span>
          <Switch
            checked={props.liquidGlassEnabled}
            onCheckedChange={(checked) =>
              props.onLiquidGlassEnabledChange(Boolean(checked))
            }
            aria-label="液态玻璃效果"
          />
        </label>
        <div className="liquid-intensity-control">
          <span>
            <label htmlFor={liquidGlassIntensityId}>液态玻璃强度</label>
            <output htmlFor={liquidGlassIntensityId} aria-hidden="true">
              {props.liquidGlassIntensity}
            </output>
          </span>
          <input
            id={liquidGlassIntensityId}
            className="liquid-intensity-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={props.liquidGlassIntensity}
            disabled={!props.liquidGlassEnabled}
            onChange={(event) =>
              props.onLiquidGlassIntensityChange(Number(event.target.value))
            }
            aria-label="液态玻璃强度"
          />
        </div>
      </div>

      <div className="token-section">
        <div className="summary-title">
          <KeyRound size={16} />
          <span>Globalping Token</span>
        </div>
        <label className="field-label">
          <span>Token</span>
          <Input
            type="password"
            value={props.globalpingTokenDraft}
            onChange={(event) =>
              props.onGlobalpingTokenDraftChange(event.target.value)
            }
            placeholder="可选：使用自己的 Globalping Token"
            autoComplete="off"
            aria-label="Globalping Token"
            aria-describedby={globalpingTokenStatusId}
          />
        </label>
        <label className="token-remember">
          <span>记住到本机</span>
          <Switch
            checked={props.globalpingTokenRemembered}
            onCheckedChange={(checked) =>
              props.onGlobalpingTokenRememberedChange(Boolean(checked))
            }
            aria-label="记住 Globalping 到本机"
          />
        </label>
        <div className="token-actions">
          <span id={globalpingTokenStatusId} role="status" aria-live="polite">
            {props.globalpingTokenSaved
              ? props.globalpingTokenRemembered
                ? "Globalping Token 已记住到本机浏览器"
                : "Globalping Token 仅当前会话可用"
              : "未使用 Globalping Token"}
          </span>
          <div>
            <LiquidGlassSurface
              variant="button"
              interactive
              actionRole="none"
              onClick={props.onSaveGlobalpingToken}
              className="liquid-glass-coverage token-action-surface"
            >
              <Button
                variant="glass"
                size="sm"
                type="button"
                aria-label="保存 Globalping"
              >
                保存
              </Button>
            </LiquidGlassSurface>
            <LiquidGlassSurface
              variant="button"
              interactive
              actionRole="none"
              onClick={props.onClearGlobalpingToken}
              className="liquid-glass-coverage token-action-surface"
            >
              <Button
                variant="ghost"
                size="sm"
                type="button"
                aria-label="清除 Globalping"
              >
                清除
              </Button>
            </LiquidGlassSurface>
          </div>
        </div>
      </div>

      <div className="token-section">
        <div className="summary-title">
          <KeyRound size={16} />
          <span>NextTrace API Token</span>
          <LiquidGlassSurface
            variant="button"
            actionRole="none"
            className="liquid-glass-coverage token-help-surface"
          >
            <a
              className="token-help-link"
              href={NEXTTRACE_API_TOKEN_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="获取 NextTrace API Token"
            >
              获取 Token
            </a>
          </LiquidGlassSurface>
        </div>
        <label className="field-label">
          <span>Token</span>
          <Input
            type="password"
            value={props.nexttraceTokenDraft}
            onChange={(event) =>
              props.onNexttraceTokenDraftChange(event.target.value)
            }
            placeholder="可选：直连 NextTrace enrichment"
            autoComplete="off"
            aria-label="NextTrace API Token"
            aria-describedby={nexttraceTokenStatusId}
          />
        </label>
        <label className="token-remember">
          <span>记住到本机</span>
          <Switch
            checked={props.nexttraceTokenRemembered}
            onCheckedChange={(checked) =>
              props.onNexttraceTokenRememberedChange(Boolean(checked))
            }
            aria-label="记住 NextTrace 到本机"
          />
        </label>
        <div className="token-actions">
          <span id={nexttraceTokenStatusId} role="status" aria-live="polite">
            {props.nexttraceTokenSaved
              ? props.nexttraceTokenRemembered
                ? "NextTrace Token 已记住到本机浏览器"
                : "NextTrace Token 仅当前会话可用"
              : "未使用 NextTrace Token"}
          </span>
          <div>
            <LiquidGlassSurface
              variant="button"
              interactive
              actionRole="none"
              onClick={props.onSaveNexttraceToken}
              className="liquid-glass-coverage token-action-surface"
            >
              <Button
                variant="glass"
                size="sm"
                type="button"
                aria-label="保存 NextTrace"
              >
                保存
              </Button>
            </LiquidGlassSurface>
            <LiquidGlassSurface
              variant="button"
              interactive
              actionRole="none"
              onClick={props.onClearNexttraceToken}
              className="liquid-glass-coverage token-action-surface"
            >
              <Button
                variant="ghost"
                size="sm"
                type="button"
                aria-label="清除 NextTrace"
              >
                清除
              </Button>
            </LiquidGlassSurface>
          </div>
        </div>
      </div>
    </div>
  );
}

function sanitizeEditableDigits(element: HTMLElement): string {
  const digits = (element.textContent || "").replace(/\D/g, "");
  if (element.textContent !== digits) {
    element.textContent = digits;
  }
  return digits;
}

function clampEditableNumber(
  element: HTMLElement,
  min: number,
  max: number,
): number {
  const digits = sanitizeEditableDigits(element);
  if (!digits) return min;
  return Math.min(max, Math.max(min, Number(digits)));
}

function commitEditableOnEnter(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

function MagicSuggestionTextarea({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const listboxId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(value.length);
  const indexedOptions = useMemo(() => indexMagicOptions(options), [options]);
  const query = useMemo(
    () => magicSegmentAt(value, cursorPosition).query,
    [cursorPosition, value],
  );
  const visibleOptions = useMemo(() => {
    const queryTokens = magicOptionTokens(query);
    if (!queryTokens.length) return [];
    const matches: string[] = [];
    for (const option of indexedOptions) {
      if (magicIndexedOptionMatchesQuery(option, queryTokens)) {
        matches.push(option.value);
        if (matches.length >= MAX_VISIBLE_SUGGESTIONS) break;
      }
    }
    return matches;
  }, [indexedOptions, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [options, value, cursorPosition]);

  const showOptions = open && visibleOptions.length > 0;
  const activeOptionId = showOptions
    ? `${listboxId}-${activeIndex}`
    : undefined;

  const updateCursorPosition = (textarea: HTMLTextAreaElement) => {
    setCursorPosition(textarea.selectionStart ?? textarea.value.length);
  };

  const selectOption = (option: string) => {
    const position = textareaRef.current?.selectionStart ?? cursorPosition;
    const segment = magicSegmentAt(value, position);
    const nextValue = replaceMagicSegment(
      value,
      segment.start,
      segment.end,
      option,
    );
    const leadingWhitespace =
      value.slice(segment.start, segment.end).match(/^\s*/)?.[0] ?? "";
    onChange(nextValue);
    setOpen(false);
    setCursorPosition(segment.start + leadingWhitespace.length + option.length);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (!visibleOptions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        Math.min(current + 1, visibleOptions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && showOptions) {
      event.preventDefault();
      selectOption(visibleOptions[activeIndex]);
    }
  };

  const handleOptionMouseDown = (
    event: MouseEvent<HTMLDivElement>,
    option: string,
  ) => {
    event.preventDefault();
    selectOption(option);
  };

  return (
    <div className="suggestion-input">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          updateCursorPosition(event.target);
          setOpen(true);
        }}
        onFocus={(event) => {
          updateCursorPosition(event.target);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 0)}
        onClick={(event) => updateCursorPosition(event.currentTarget)}
        onKeyUp={(event) => updateCursorPosition(event.currentTarget)}
        onSelect={(event) => updateCursorPosition(event.currentTarget)}
        onKeyDown={handleKeyDown}
        className="border-0 bg-transparent shadow-none backdrop-blur-none hover:bg-transparent focus-visible:ring-0"
        rows={3}
        placeholder={MAGIC_PLACEHOLDER}
        role="combobox"
        aria-label="magic string"
        aria-autocomplete="list"
        aria-expanded={showOptions}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
      />
      {showOptions && (
        <div
          id={listboxId}
          className="suggestion-popover"
          role="listbox"
          aria-label="候选列表"
        >
          {visibleOptions.map((option, index) => (
            <div
              id={`${listboxId}-${index}`}
              className="suggestion-option"
              key={option}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => handleOptionMouseDown(event, option)}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") return <Sun size={18} />;
  if (mode === "dark") return <Moon size={18} />;
  return <Monitor size={18} />;
}

function indexMagicOptions(options: string[]): IndexedMagicOption[] {
  return options.map((value) => {
    const tokens = magicOptionTokens(value);
    return {
      value,
      tokens,
      includesWorld: tokens.some((token) => token.lower === "world"),
    };
  });
}

function magicOptionTokens(value: string): IndexedMagicToken[] {
  return value
    .split("+")
    .map(compactText)
    .filter(Boolean)
    .map((token) => ({
      lower: token.toLowerCase(),
      normalizedAsn: normalizeAsn(token),
    }));
}

function magicIndexedOptionMatchesQuery(
  option: IndexedMagicOption,
  queryTokens: IndexedMagicToken[],
): boolean {
  if (!option.tokens.length || option.includesWorld) return true;
  return queryTokens.every((queryToken) =>
    option.tokens.some((optionToken) =>
      magicIndexedTokenMatches(optionToken, queryToken),
    ),
  );
}

function magicIndexedTokenMatches(
  optionToken: IndexedMagicToken,
  queryToken: IndexedMagicToken,
): boolean {
  if (!queryToken.lower || queryToken.lower === "world") return true;
  if (/^(AS)?\d+$/i.test(queryToken.lower)) {
    return (
      optionToken.normalizedAsn === queryToken.normalizedAsn ||
      optionToken.lower.includes(queryToken.lower)
    );
  }
  return optionToken.lower.includes(queryToken.lower);
}

function SuggestionInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const visibleOptions = useMemo(() => {
    const query = value.trim().toLowerCase();
    const matches = query
      ? options.filter((option) => option.toLowerCase().includes(query))
      : options;
    return matches.slice(0, MAX_VISIBLE_SUGGESTIONS);
  }, [options, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [options, value]);

  const showOptions = open && visibleOptions.length > 0;
  const activeOptionId = showOptions
    ? `${listboxId}-${activeIndex}`
    : undefined;

  const selectOption = (option: string) => {
    onChange(option);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (!visibleOptions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        Math.min(current + 1, visibleOptions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && showOptions) {
      event.preventDefault();
      selectOption(visibleOptions[activeIndex]);
    }
  };

  const handleOptionMouseDown = (
    event: MouseEvent<HTMLDivElement>,
    option: string,
  ) => {
    event.preventDefault();
    selectOption(option);
  };

  return (
    <div className="suggestion-input">
      <Input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={showOptions}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
      />
      {showOptions && (
        <div
          id={listboxId}
          className="suggestion-popover"
          role="listbox"
          aria-label="候选列表"
        >
          {visibleOptions.map((option, index) => (
            <div
              id={`${listboxId}-${index}`}
              className="suggestion-option"
              key={option}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => handleOptionMouseDown(event, option)}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

function magicSegmentAt(
  value: string,
  position: number,
): { start: number; end: number; query: string } {
  const cursor = Math.max(0, Math.min(position, value.length));
  const start = value.lastIndexOf(",", Math.max(0, cursor - 1)) + 1;
  const nextComma = value.indexOf(",", cursor);
  const end = nextComma === -1 ? value.length : nextComma;
  return { start, end, query: value.slice(start, end).trim() };
}

function replaceMagicSegment(
  value: string,
  start: number,
  end: number,
  option: string,
): string {
  const segment = value.slice(start, end);
  const leadingWhitespace = segment.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = segment.trim()
    ? (segment.match(/\s*$/)?.[0] ?? "")
    : "";
  return `${value.slice(0, start)}${leadingWhitespace}${option}${trailingWhitespace}${value.slice(end)}`;
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
