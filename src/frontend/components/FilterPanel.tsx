import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  Filter,
  Info,
  Languages,
  Monitor,
  Moon,
  Play,
  RotateCcw,
  Settings,
  Sun,
} from "lucide-react";
import {
  asnSuggestionLabel,
  type FilterChip,
  type ProbeFilterSuggestions,
} from "../../shared/filters";
import {
  DEFAULT_PROBE_LIMIT,
  type TraceFilters,
  type TraceProtocol,
} from "../../shared/types";
import type { ResultContentOrder } from "./mapProjection";
import { themeModeLabel, type ThemeMode } from "../theme";
import { useI18n, type Locale } from "../i18n";
import { Overlay } from "./Overlay";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { AdvancedParamsPanel } from "./filter-panel/AdvancedParamsPanel";
import { ExactFiltersForm } from "./filter-panel/ExactFiltersForm";
import { QuotaMeter, type QuotaState } from "./filter-panel/QuotaMeter";
import { MagicSuggestionTextarea } from "./filter-panel/suggestions";
import { handleSpaLinkClick } from "./spaNavigation";
import { countrySuggestionLabel } from "../lib/countryNames";

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
  quota: QuotaState;
  selectionNotice: string;
  mapSelectionActive?: boolean;
  loading: boolean;
  canSubmit: boolean;
  globalpingTokenDraft: string;
  globalpingTokenSaved: boolean;
  globalpingTokenRemembered: boolean;
  nexttraceTokenDraft: string;
  nexttraceTokenSaved: boolean;
  nexttraceTokenRemembered: boolean;
  themeMode: ThemeMode;
  locale?: Locale;
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
  onLocaleChange?: (locale: Locale) => void;
  onResultContentOrderChange: (value: ResultContentOrder) => void;
  onOpenAdvancedParams?: () => void;
  onNavigateHome: () => void;
  onNavigateAbout: () => void;
  onReset: () => void;
  onClearMapSelection?: () => void;
  onSubmit: () => void;
}

const EMPTY_FILTER_SUGGESTIONS: ProbeFilterSuggestions = {
  countries: [],
  cities: [],
  asns: [],
  asnNetworks: {},
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
  const messages = useI18n();
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
  const switchLocale = () => {
    props.onLocaleChange?.((props.locale ?? "zh-CN") === "zh-CN" ? "en-US" : "zh-CN");
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
              aria-label={messages.home}
            >
              <h1 className="brand-title" aria-label="GlobalTrace">
                <span className="brand-title-lead">Global</span>
                <span className="brand-title-mark">Trace</span>
              </h1>
              <p className="brand-subtitle">{messages.brandSubtitle}</p>
            </a>
            <div className="panel-title-actions">
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="panel-action-button"
                onClick={switchLocale}
                title={messages.switchLanguage}
                aria-label={messages.switchLanguage}
              >
                <Languages size={18} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="panel-action-button"
                onClick={props.onCycleThemeMode}
                title={messages.theme(themeModeLabel(props.themeMode))}
                aria-label={messages.theme(themeModeLabel(props.themeMode))}
              >
                <ThemeIcon mode={props.themeMode} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="panel-action-button"
                onClick={openAdvancedParams}
                title={messages.advancedParams}
                aria-label={messages.openAdvancedParams}
              >
                <Settings size={18} />
              </Button>
            </div>
          </div>

          <section
            className="primary-controls"
            aria-label={messages.basicParams}
          >
            <div className="target-command-row">
              <input
                className="target-command-input"
                value={props.target}
                onChange={(event) => props.onTargetChange(event.target.value)}
                placeholder={messages.targetPlaceholder}
                maxLength={253}
                aria-label={messages.target}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <button
                type="button"
                className="primary-action target-submit-button"
                disabled={props.loading || !props.canSubmit}
                onClick={props.onSubmit}
                aria-label={messages.startTrace}
              >
                <Play size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="parameter-pill-grid">
              <div
                className="target-ip-toggle"
                role="group"
                aria-label={messages.switchIpVersion}
              >
                <button
                  type="button"
                  className={
                    props.ipVersion === 4
                      ? "target-ip-button is-active"
                      : "target-ip-button"
                  }
                  aria-pressed={props.ipVersion === 4}
                  onClick={() => props.onIpVersionChange(4)}
                >
                  IPv4
                </button>
                <button
                  type="button"
                  className={
                    props.ipVersion === 6
                      ? "target-ip-button is-active"
                      : "target-ip-button"
                  }
                  aria-pressed={props.ipVersion === 6}
                  onClick={() => props.onIpVersionChange(6)}
                >
                  IPv6
                </button>
              </div>
              <div className="parameter-pill protocol-pill" aria-label={messages.protocol}>
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
              <label
                className="parameter-pill port-pill"
                onMouseDown={focusEditableDigitPill}
              >
                <span className="parameter-pill-label">{messages.port}</span>
                <EditableDigitField
                  className="parameter-pill-editable port-pill-value"
                  value={props.port}
                  placeholder={messages.auto}
                  ariaLabel={messages.port}
                  onChange={props.onPortChange}
                />
              </label>
              <label
                className="parameter-pill packets-pill"
                onMouseDown={focusEditableDigitPill}
              >
                <span className="parameter-pill-label">Packets</span>
                <EditableDigitField
                  className="parameter-pill-editable numeric-pill-value"
                  value={String(props.packets)}
                  ariaLabel="Packets"
                  min={1}
                  max={16}
                  onChange={(value) =>
                    props.onPacketsChange(Number(value) || 1)
                  }
                />
              </label>

              <label
                className="parameter-pill limit-pill"
                onMouseDown={focusEditableDigitPill}
              >
                <span className="parameter-pill-label">Limit</span>
                <EditableDigitField
                  className="parameter-pill-editable numeric-pill-value"
                  value={String(props.limit)}
                  ariaLabel="Limit"
                  min={1}
                  max={10}
                  onChange={(value) => props.onLimitChange(Number(value) || 1)}
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
            {props.limit > DEFAULT_PROBE_LIMIT && (
              <div className="limit-warning" role="status">
                <span>{messages.probeLimitSlowNotice}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className="limit-warning-action"
                  onClick={() => props.onLimitChange(DEFAULT_PROBE_LIMIT)}
                >
                  {messages.reduceProbeLimit(DEFAULT_PROBE_LIMIT)}
                </Button>
              </div>
            )}
          </section>

          <section className="filter-summary" aria-label={messages.currentFilters}>
            <div className="summary-title">
              <Filter size={14} />
              <span>{messages.currentFilters}</span>
              <button
                type="button"
                className="summary-reset-button"
                onClick={props.onReset}
                title={messages.resetFilters}
                aria-label={messages.resetFilters}
              >
                <RotateCcw size={12} />
              </button>
            </div>
            <div className="filter-summary-body">
              <div className="chip-row" data-testid="filter-chips">
                {props.chips.map((chip) =>
                  chip.key === "magic" ? (
                    <span className="filter-magic-summary" key={chip.key}>
                      <span className="filter-chip-value">{chip.value}</span>
                    </span>
                  ) : (
                    <Badge className="filter-chip" key={chip.key}>
                      <strong>{chip.label}</strong>
                      <span className="filter-chip-value">
                        {chip.key === "country"
                          ? countrySuggestionLabel(chip.value, messages.locale)
                          : chip.key === "asn"
                            ? asnSuggestionLabel(
                                chip.value,
                                filterSuggestions.asnNetworks,
                              )
                            : chip.value}
                      </span>
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
                    messages,
                  )}
                </span>
                {props.mapSelectionActive && props.onClearMapSelection ? (
                  <button
                    type="button"
                    className="clear-selection-button"
                    title={messages.clearMapFilterHint}
                    aria-label={messages.cancelMapFilter}
                    onClick={props.onClearMapSelection}
                  >
                    {messages.cancelMapFilter}
                  </button>
                ) : null}
              </div>
              {props.selectionNotice ? (
                <p className="notice-text selection-notice">{props.selectionNotice}</p>
              ) : null}
            </div>
          </section>

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
              <Filter size={14} />
              {messages.exactFilters}
            </summary>

            <div className="advanced-panel-body">
              <ExactFiltersForm
                filters={props.filters}
                filterSuggestions={filterSuggestions}
                onFiltersChange={props.onFiltersChange}
              />
            </div>
          </details>

          <Overlay
            open={advancedParamsOpen}
            title={messages.advancedParams}
            size="compact"
            chrome="default"
            placement="center"
            onClose={() => setAdvancedParamsOpen(false)}
          >
            <AdvancedParamsPanel {...props} />
          </Overlay>
        </div>

        <div className="filter-panel-footer" data-testid="filter-panel-footer">
          <QuotaMeter {...props.quota} />
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
            <a
              href="/about"
              className="attribution-action-link"
              aria-label={messages.aboutGlobalTrace}
              onClick={(event) => handleSpaLinkClick(event, props.onNavigateAbout)}
            >
              <Info size={15} aria-hidden="true" />
              {messages.about}
            </a>
          </div>
        </div>
      </aside>
    </Surface>
  );
}

function placeCaretAtEnd(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectEditableContents(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function focusEditableDigitPill(event: MouseEvent<HTMLLabelElement>): void {
  const target = event.target as HTMLElement | null;
  if (target?.isContentEditable || target?.closest("[contenteditable='true']")) {
    return;
  }
  event.preventDefault();
  const editable = event.currentTarget.querySelector<HTMLElement>(
    "[contenteditable='true']",
  );
  editable?.focus();
}

function sanitizeEditableDigits(element: HTMLElement): string {
  const digits = (element.textContent || "").replace(/\D/g, "");
  if (element.textContent !== digits) {
    element.textContent = digits;
    placeCaretAtEnd(element);
  }
  return digits;
}

function clampEditableDigits(
  element: HTMLElement,
  min: number,
  max: number,
): string {
  const digits = sanitizeEditableDigits(element);
  if (!digits) {
    return "";
  }
  const next = String(Math.min(max, Math.max(min, Number(digits))));
  if (element.textContent !== next) {
    element.textContent = next;
    placeCaretAtEnd(element);
  }
  return next;
}

function commitEditableOnEnter(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

function EditableDigitField(props: {
  value: string;
  className: string;
  ariaLabel: string;
  placeholder?: string;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || focusedRef.current) return;
    if (element.textContent !== props.value) {
      element.textContent = props.value;
    }
  }, [props.value]);

  return (
    <span
      ref={ref}
      className={props.className}
      role="textbox"
      contentEditable
      suppressContentEditableWarning
      tabIndex={0}
      inputMode="numeric"
      data-placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      onFocus={() => {
        focusedRef.current = true;
        const element = ref.current;
        if (!element) return;
        requestAnimationFrame(() => {
          if (document.activeElement === element) {
            selectEditableContents(element);
          }
        });
      }}
      onBlur={() => {
        focusedRef.current = false;
        const element = ref.current;
        if (!element) return;
        if (element.textContent !== props.value) {
          element.textContent = props.value;
        }
      }}
      onInput={(event) => {
        const element = event.currentTarget;
        if (props.min != null && props.max != null) {
          props.onChange(clampEditableDigits(element, props.min, props.max));
          return;
        }
        props.onChange(sanitizeEditableDigits(element));
      }}
      onKeyDown={commitEditableOnEnter}
    />
  );
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
  messages?: ReturnType<typeof useI18n>,
): string {
  if (messages) return messages.probeStatus(status, visible, total);
  if (status === "loading") return "probes 加载中";
  if (status === "error") return "probes 读取失败";
  return `${visible} / ${total} probes 匹配`;
}
