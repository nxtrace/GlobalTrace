import { useId } from "react";
import { KeyRound, Map as MapIcon, Monitor, Table2 } from "lucide-react";
import type { FilterPanelProps } from "../FilterPanel";
import { LiquidGlassSurface } from "../LiquidGlassSurface";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { useI18n } from "../../i18n";

const NEXTTRACE_API_TOKEN_URL = "https://api.nxtrace.org/v4/api-tokens";

export function AdvancedParamsPanel(props: FilterPanelProps) {
  const messages = useI18n();
  const globalpingTokenStatusId = useId();
  const nexttraceTokenStatusId = useId();
  const liquidGlassIntensityId = useId();
  return (
    <div className="advanced-params-panel">
      <div className="token-section">
        <div className="summary-title">
          <Monitor size={16} />
          <span>{messages.uiEffects}</span>
        </div>
        <label className="token-remember">
          <span>{messages.liquidGlassEffect}</span>
          <Switch
            checked={props.liquidGlassEnabled}
            onCheckedChange={(checked) =>
              props.onLiquidGlassEnabledChange(Boolean(checked))
            }
            aria-label={messages.liquidGlassEffect}
          />
        </label>
        <div className="liquid-intensity-control">
          <span>
            <label htmlFor={liquidGlassIntensityId}>{messages.liquidGlassIntensity}</label>
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
            aria-label={messages.liquidGlassIntensity}
          />
        </div>
        <div className="result-layout-setting">
          <span>{messages.resultOrder}：</span>
          <div className="segmented result-layout-control" role="radiogroup" aria-label={messages.resultOrder}>
            <label className={props.resultContentOrder === "map-first" ? "selected" : ""}>
              <span className="result-layout-option-label">
                <MapIcon size={16} aria-hidden="true" />
                <span>{messages.mapFirst}</span>
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
                <span>{messages.tableFirst}</span>
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
            placeholder={messages.globalpingTokenPlaceholder}
            autoComplete="off"
            aria-label="Globalping Token"
            aria-describedby={globalpingTokenStatusId}
          />
        </label>
        <label className="token-remember">
          <span>{messages.rememberLocal}</span>
          <Switch
            checked={props.globalpingTokenRemembered}
            onCheckedChange={(checked) =>
              props.onGlobalpingTokenRememberedChange(Boolean(checked))
            }
            aria-label={messages.rememberGlobalping}
          />
        </label>
        <div className="token-actions">
          <span id={globalpingTokenStatusId} role="status" aria-live="polite">
            {messages.tokenStatus("Globalping", props.globalpingTokenSaved, props.globalpingTokenRemembered)}
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
                aria-label={messages.saveProvider("Globalping")}
              >
                {messages.save}
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
                aria-label={messages.clearProvider("Globalping")}
              >
                {messages.clear}
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
              aria-label={messages.getNexttraceToken}
            >
              {messages.getNexttraceToken.replace("NextTrace API ", "")}
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
            placeholder={messages.nexttraceTokenPlaceholder}
            autoComplete="off"
            aria-label="NextTrace API Token"
            aria-describedby={nexttraceTokenStatusId}
          />
        </label>
        <label className="token-remember">
          <span>{messages.rememberLocal}</span>
          <Switch
            checked={props.nexttraceTokenRemembered}
            onCheckedChange={(checked) =>
              props.onNexttraceTokenRememberedChange(Boolean(checked))
            }
            aria-label={messages.rememberNexttrace}
          />
        </label>
        <div className="token-actions">
          <span id={nexttraceTokenStatusId} role="status" aria-live="polite">
            {messages.tokenStatus("NextTrace", props.nexttraceTokenSaved, props.nexttraceTokenRemembered)}
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
                aria-label={messages.saveProvider("NextTrace")}
              >
                {messages.save}
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
                aria-label={messages.clearProvider("NextTrace")}
              >
                {messages.clear}
              </Button>
            </LiquidGlassSurface>
          </div>
        </div>
      </div>
    </div>
  );
}
