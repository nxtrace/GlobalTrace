import { useId } from "react";
import { KeyRound, Map as MapIcon, Monitor, Table2 } from "lucide-react";
import type { FilterPanelProps } from "../FilterPanel";
import { LiquidGlassSurface } from "../LiquidGlassSurface";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";

const NEXTTRACE_API_TOKEN_URL = "https://api.nxtrace.org/v4/api-tokens";

export function AdvancedParamsPanel(props: FilterPanelProps) {
  const globalpingTokenStatusId = useId();
  const nexttraceTokenStatusId = useId();
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
        <div className="result-layout-setting">
          <span>结果页面显示顺序：</span>
          <div className="segmented result-layout-control" role="radiogroup" aria-label="结果页面显示顺序">
            <label className={props.resultContentOrder === "map-first" ? "selected" : ""}>
              <span className="result-layout-option-label">
                <MapIcon size={16} aria-hidden="true" />
                <span>地图优先</span>
              </span>
              <input
                type="radio"
                name="result-content-order"
                checked={props.resultContentOrder === "map-first"}
                onChange={() => props.onResultContentOrderChange("map-first")}
              />
            </label>
            <label className={props.resultContentOrder === "table-first" ? "selected" : ""}>
              <span className="result-layout-option-label">
                <Table2 size={16} aria-hidden="true" />
                <span>表格优先</span>
              </span>
              <input
                type="radio"
                name="result-content-order"
                checked={props.resultContentOrder === "table-first"}
                onChange={() => props.onResultContentOrderChange("table-first")}
              />
            </label>
          </div>
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
