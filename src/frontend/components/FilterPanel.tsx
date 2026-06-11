import { useId } from "react";
import { Filter, Info, KeyRound, Monitor, Moon, Play, RotateCcw, ShieldCheck, SlidersHorizontal, Sun } from "lucide-react";
import type { FilterChip, ProbeFilterSuggestions } from "../../shared/filters";
import type { TraceFilters, TraceProtocol } from "../../shared/types";
import { themeModeLabel, type ThemeMode } from "../theme";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { TurnstileBox } from "./TurnstileBox";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input, NativeSelect, Textarea } from "./ui/input";
import { Surface } from "./ui/surface";
import { Switch } from "./ui/switch";

export type IpVersionSelection = "" | 4 | 6;

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
  turnstileSiteKey: string;
  turnstileReady: boolean;
  turnstileResetNonce: number;
  globalpingTokenDraft: string;
  globalpingTokenSaved: boolean;
  themeMode: ThemeMode;
  onTargetChange: (value: string) => void;
  onProtocolChange: (value: TraceProtocol) => void;
  onIpVersionChange: (value: IpVersionSelection) => void;
  onPortChange: (value: string) => void;
  onPacketsChange: (value: number) => void;
  onLimitChange: (value: number) => void;
  onFiltersChange: (value: TraceFilters) => void;
  onTurnstileToken: (token: string) => void;
  onGlobalpingTokenDraftChange: (token: string) => void;
  onSaveGlobalpingToken: () => void;
  onClearGlobalpingToken: () => void;
  onCycleThemeMode: () => void;
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
};

export function FilterPanel(props: FilterPanelProps) {
  const suggestionId = useId();
  const filterSuggestions = props.filterSuggestions ?? EMPTY_FILTER_SUGGESTIONS;
  const countrySuggestionsId = `${suggestionId}-country-suggestions`;
  const citySuggestionsId = `${suggestionId}-city-suggestions`;
  const asnSuggestionsId = `${suggestionId}-asn-suggestions`;
  const networkSuggestionsId = `${suggestionId}-network-suggestions`;

  const setFilter = (key: keyof TraceFilters, value: string | boolean) => {
    const nextValue = cleanFilterValue(value);
    if (key === "magic") {
      props.onFiltersChange({ magic: typeof nextValue === "string" ? nextValue : "world" });
      return;
    }
    props.onFiltersChange({ ...props.filters, magic: undefined, [key]: nextValue });
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
              <p>Globalping x NextTrace 的全球路由追踪</p>
            </a>
            <div className="panel-title-actions">
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={props.onCycleThemeMode}
                title={`主题：${themeModeLabel(props.themeMode)}`}
                aria-label={`主题：${themeModeLabel(props.themeMode)}`}
              >
                <ThemeIcon mode={props.themeMode} />
              </Button>
              <Button variant="ghost" size="icon" type="button" onClick={props.onReset} title="重置筛选" aria-label="重置筛选">
                <RotateCcw size={18} />
              </Button>
            </div>
          </div>

          <Surface asChild variant="flat" className="control-section primary-controls" aria-label="基础参数">
            <section>
              <label className="field-label">
                <span>目标</span>
                <Input
                  value={props.target}
                  onChange={(event) => props.onTargetChange(event.target.value)}
                  placeholder="globalping.io"
                  maxLength={253}
                  aria-label="目标"
                />
              </label>

              <div className="control-grid compact">
                <label className="field-label">
                  <span>协议</span>
                  <NativeSelect
                    value={props.protocol}
                    onChange={(event) => props.onProtocolChange(event.target.value as TraceProtocol)}
                    aria-label="协议"
                  >
                    <option value="ICMP">ICMP</option>
                    <option value="TCP">TCP</option>
                    <option value="UDP">UDP</option>
                  </NativeSelect>
                </label>
                <label className="field-label">
                  <span>IP 版本</span>
                  <NativeSelect
                    value={props.ipVersion}
                    onChange={(event) => props.onIpVersionChange(parseIpVersionSelection(event.target.value))}
                    aria-label="IP 版本"
                  >
                    <option value="">自动</option>
                    <option value="4">IPv4</option>
                    <option value="6">IPv6</option>
                  </NativeSelect>
                </label>
                <label className="field-label">
                  <span>probes</span>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={props.limit}
                    onChange={(event) => props.onLimitChange(Number(event.target.value))}
                    aria-label="probes"
                  />
                </label>
              </div>

              <label className="field-label">
                <span>magic string</span>
                <Textarea
                  value={props.filters.magic || ""}
                  onChange={(event) => setFilter("magic", event.target.value)}
                  rows={3}
                  placeholder="US+Comcast+eyeball-network, DE+Hetzner"
                />
              </label>
            </section>
          </Surface>

          <Surface asChild variant="flat" className="filter-summary" aria-label="当前筛选">
            <section>
              <div className="summary-title">
                <Filter size={16} />
                <span>当前筛选</span>
              </div>
              <div className="chip-row" data-testid="filter-chips">
                {props.chips.map((chip) => (
                  <Badge className="filter-chip" key={chip.key}>
                    {chip.key !== "magic" && <strong>{chip.label}</strong>}
                    <span className="filter-chip-value">{chip.value}</span>
                  </Badge>
                ))}
              </div>
              <div className="probe-match-row">
                <span>{probeStatusText(props.probesStatus, props.visibleProbes, props.totalProbes)}</span>
                {props.selectionNotice && <span className="notice-text">{props.selectionNotice}</span>}
              </div>
            </section>
          </Surface>

          <Surface asChild variant="flat">
            <details className="advanced-panel">
              <summary>
                <SlidersHorizontal size={16} />
                高级参数与精确筛选
              </summary>

              <div className="advanced-panel-body">
                <div className="control-grid">
                  <label className="field-label">
                    <span>端口</span>
                    <Input
                      value={props.port}
                      onChange={(event) => props.onPortChange(event.target.value)}
                      inputMode="numeric"
                      placeholder="自动"
                      aria-label="端口"
                    />
                  </label>
                  <label className="field-label">
                    <span>包数</span>
                    <Input
                      type="number"
                      min={1}
                      max={16}
                      value={props.packets}
                      onChange={(event) => props.onPacketsChange(Number(event.target.value))}
                      aria-label="包数"
                    />
                  </label>
                  <label className="field-label">
                    <span>国家/地区</span>
                    <Input
                      list={countrySuggestionsId}
                      value={props.filters.country || ""}
                      onChange={(event) => setFilter("country", event.target.value)}
                    />
                  </label>
                  <label className="field-label">
                    <span>城市</span>
                    <Input
                      list={citySuggestionsId}
                      value={props.filters.city || ""}
                      onChange={(event) => setFilter("city", event.target.value)}
                    />
                  </label>
                  <label className="field-label">
                    <span>ASN</span>
                    <Input
                      list={asnSuggestionsId}
                      value={props.filters.asn || ""}
                      onChange={(event) => setFilter("asn", event.target.value)}
                    />
                  </label>
                  <label className="field-label">
                    <span>network</span>
                    <Input
                      list={networkSuggestionsId}
                      value={props.filters.network || ""}
                      onChange={(event) => setFilter("network", event.target.value)}
                    />
                  </label>
                  <SuggestionList id={countrySuggestionsId} options={filterSuggestions.countries} />
                  <SuggestionList id={citySuggestionsId} options={filterSuggestions.cities} />
                  <SuggestionList id={asnSuggestionsId} options={filterSuggestions.asns} />
                  <SuggestionList id={networkSuggestionsId} options={filterSuggestions.networks} />
                </div>

                <div className="segmented" aria-label="网络类型">
                  <label className={props.filters.eyeball ? "selected" : ""}>
                    <span>eyeball</span>
                    <Switch
                      checked={Boolean(props.filters.eyeball)}
                      onCheckedChange={(checked) => setFilter("eyeball", Boolean(checked))}
                      aria-label="eyeball"
                    />
                  </label>
                  <label className={props.filters.datacenter ? "selected" : ""}>
                    <span>datacenter</span>
                    <Switch
                      checked={Boolean(props.filters.datacenter)}
                      onCheckedChange={(checked) => setFilter("datacenter", Boolean(checked))}
                      aria-label="datacenter"
                    />
                  </label>
                </div>

                <label className="field-label">
                  <span>tag</span>
                  <Input value={props.filters.tag || ""} onChange={(event) => setFilter("tag", event.target.value)} />
                </label>

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
                      onChange={(event) => props.onGlobalpingTokenDraftChange(event.target.value)}
                      placeholder="可选：使用自己的 Globalping Token"
                      autoComplete="off"
                      aria-label="Globalping Token"
                    />
                  </label>
                  <div className="token-actions">
                    <span>{props.globalpingTokenSaved ? "已保存到本机浏览器" : "未使用个人 Token"}</span>
                    <div>
                      <Button variant="glass" size="sm" type="button" onClick={props.onSaveGlobalpingToken}>
                        保存
                      </Button>
                      <Button variant="ghost" size="sm" type="button" onClick={props.onClearGlobalpingToken}>
                        清除
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </Surface>
        </div>

        <div className="filter-panel-footer" data-testid="filter-panel-footer">
          <Surface variant="flat" className="run-state" aria-live="polite">
            <ShieldCheck size={16} />
            <div>
              <strong>{props.turnstileSiteKey ? "Turnstile 已配置" : "本地模式，无 Turnstile site key"}</strong>
              <span>{props.quotaLabel}</span>
            </div>
          </Surface>

          <TurnstileBox
            siteKey={props.turnstileSiteKey}
            resetNonce={props.turnstileResetNonce}
            onToken={props.onTurnstileToken}
          />

          <Surface variant="flat" className="attribution-panel">
            <span>
              Powered by{" "}
              <a href="https://globalping.io/" target="_blank" rel="noreferrer">
                Globalping
              </a>{" "}
              <span className="attribution-separator">×</span>{" "}
              <a href="https://www.nxtrace.org/" target="_blank" rel="noreferrer">
                NextTrace
              </a>
            </span>
            <Button variant="ghost" size="sm" type="button" onClick={props.onNavigateAbout} aria-label="关于 GlobalTrace">
              <Info size={15} />
              关于
            </Button>
          </Surface>

          <LiquidGlassSurface variant="button" fullWidth className="run-action-surface">
            <Button
              variant="primary"
              size="lg"
              className="primary-action"
              type="button"
              disabled={props.loading || !props.turnstileReady}
              onClick={props.onSubmit}
              aria-label="开始网络路径诊断"
            >
              <Play size={18} />
              {props.loading ? "运行中" : "开始诊断"}
            </Button>
          </LiquidGlassSurface>
        </div>
      </aside>
    </Surface>
  );
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") return <Sun size={18} />;
  if (mode === "dark") return <Moon size={18} />;
  return <Monitor size={18} />;
}

function SuggestionList({ id, options }: { id: string; options: string[] }) {
  return (
    <datalist id={id}>
      {options.map((option) => (
        <option key={option} value={option} />
      ))}
    </datalist>
  );
}

function cleanFilterValue(value: string | boolean): string | boolean | undefined {
  if (typeof value === "string") {
    return value.trim() ? value : undefined;
  }
  return value || undefined;
}

function parseIpVersionSelection(value: string): IpVersionSelection {
  if (value === "4") return 4;
  if (value === "6") return 6;
  return "";
}

function probeStatusText(status: "loading" | "ready" | "error", visible: number, total: number): string {
  if (status === "loading") return "probes 加载中";
  if (status === "error") return "probes 读取失败";
  return `${visible} / ${total} probes 匹配`;
}
