import { useId } from "react";
import { KeyRound, Map as MapIcon, Monitor, Table2 } from "lucide-react";
import type { FilterPanelProps } from "../FilterPanel";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { useI18n } from "../../i18n";

const NEXTTRACE_API_TOKEN_URL = "https://api.nxtrace.org/v4/api-tokens";

export function AdvancedParamsPanel(props: FilterPanelProps) {
  const messages = useI18n();
  const globalpingTokenStatusId = useId();
  const nexttraceTokenStatusId = useId();
  return (
    <div className="advanced-params-panel">
      <section className="advanced-params-section">
        <div className="advanced-params-section-header">
          <Monitor size={14} />
          <span>{messages.resultOrder}</span>
          <span className="advanced-params-section-meta">{messages.resultOrderDesktopOnly}</span>
        </div>
        <div className="advanced-params-section-body">
          <div
            className="display-mode-control"
            role="radiogroup"
            aria-label={`${messages.resultOrder} · ${messages.resultOrderDesktopOnly}`}
          >
            <button
              type="button"
              role="radio"
              className={
                props.resultContentOrder === "map-first"
                  ? "display-mode-option is-active"
                  : "display-mode-option"
              }
              aria-checked={props.resultContentOrder === "map-first"}
              onClick={() => props.onResultContentOrderChange("map-first")}
            >
              <MapIcon size={14} aria-hidden="true" />
              <span>{messages.mapFirst}</span>
            </button>
            <button
              type="button"
              role="radio"
              className={
                props.resultContentOrder === "table-first"
                  ? "display-mode-option is-active"
                  : "display-mode-option"
              }
              aria-checked={props.resultContentOrder === "table-first"}
              onClick={() => props.onResultContentOrderChange("table-first")}
            >
              <Table2 size={14} aria-hidden="true" />
              <span>{messages.tableFirst}</span>
            </button>
          </div>
        </div>
      </section>

      <TokenSection
        title="Globalping Token"
        tokenAriaLabel="Globalping Token"
        statusId={globalpingTokenStatusId}
        draft={props.globalpingTokenDraft}
        remembered={props.globalpingTokenRemembered}
        placeholder={messages.globalpingTokenPlaceholder}
        rememberLabel={messages.rememberLocal}
        rememberAriaLabel={messages.rememberGlobalping}
        statusText={messages.tokenStatus(
          "Globalping",
          props.globalpingTokenSaved,
          props.globalpingTokenRemembered,
        )}
        saveAriaLabel={messages.saveProvider("Globalping")}
        clearAriaLabel={messages.clearProvider("Globalping")}
        saveLabel={messages.save}
        clearLabel={messages.clear}
        onDraftChange={props.onGlobalpingTokenDraftChange}
        onRememberedChange={props.onGlobalpingTokenRememberedChange}
        onSave={props.onSaveGlobalpingToken}
        onClear={props.onClearGlobalpingToken}
      />

      <TokenSection
        title="NextTrace API Token"
        tokenAriaLabel="NextTrace API Token"
        statusId={nexttraceTokenStatusId}
        draft={props.nexttraceTokenDraft}
        remembered={props.nexttraceTokenRemembered}
        placeholder={messages.nexttraceTokenPlaceholder}
        rememberLabel={messages.rememberLocal}
        rememberAriaLabel={messages.rememberNexttrace}
        statusText={messages.tokenStatus(
          "NextTrace",
          props.nexttraceTokenSaved,
          props.nexttraceTokenRemembered,
        )}
        saveAriaLabel={messages.saveProvider("NextTrace")}
        clearAriaLabel={messages.clearProvider("NextTrace")}
        saveLabel={messages.save}
        clearLabel={messages.clear}
        helpHref={NEXTTRACE_API_TOKEN_URL}
        helpLabel={messages.getNexttraceToken}
        helpText={messages.getNexttraceToken.replace("NextTrace API ", "")}
        onDraftChange={props.onNexttraceTokenDraftChange}
        onRememberedChange={props.onNexttraceTokenRememberedChange}
        onSave={props.onSaveNexttraceToken}
        onClear={props.onClearNexttraceToken}
      />
    </div>
  );
}

interface TokenSectionProps {
  title: string;
  tokenAriaLabel: string;
  statusId: string;
  draft: string;
  remembered: boolean;
  placeholder: string;
  rememberLabel: string;
  rememberAriaLabel: string;
  statusText: string;
  saveAriaLabel: string;
  clearAriaLabel: string;
  saveLabel: string;
  clearLabel: string;
  helpHref?: string;
  helpLabel?: string;
  helpText?: string;
  onDraftChange: (value: string) => void;
  onRememberedChange: (value: boolean) => void;
  onSave: () => void;
  onClear: () => void;
}

function TokenSection(props: TokenSectionProps) {
  return (
    <section className="advanced-params-section">
      <div className="advanced-params-section-header">
        <KeyRound size={14} />
        <span>{props.title}</span>
        {props.helpHref && props.helpLabel && props.helpText ? (
          <a
            className="token-help-link"
            href={props.helpHref}
            target="_blank"
            rel="noreferrer"
            aria-label={props.helpLabel}
          >
            {props.helpText}
          </a>
        ) : null}
      </div>
      <div className="advanced-params-section-body">
        <label className="field-label">
          <span>Token</span>
          <Input
            type="password"
            value={props.draft}
            onChange={(event) => props.onDraftChange(event.target.value)}
            placeholder={props.placeholder}
            autoComplete="off"
            aria-label={props.tokenAriaLabel}
            aria-describedby={props.statusId}
          />
        </label>
        <label className="token-remember">
          <span>{props.rememberLabel}</span>
          <Switch
            size="sm"
            checked={props.remembered}
            onCheckedChange={(checked) =>
              props.onRememberedChange(Boolean(checked))
            }
            aria-label={props.rememberAriaLabel}
          />
        </label>
        <div className="token-actions">
          <span id={props.statusId} role="status" aria-live="polite">
            {props.statusText}
          </span>
          <div>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              className="token-action-button"
              onClick={props.onSave}
              aria-label={props.saveAriaLabel}
            >
              {props.saveLabel}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="token-action-button"
              onClick={props.onClear}
              aria-label={props.clearAriaLabel}
            >
              {props.clearLabel}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
