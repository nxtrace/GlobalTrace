import { useI18n } from "../../i18n";

export interface QuotaState {
  status: "loading" | "ready" | "error";
  remaining: number;
  limit: number;
  actor: string;
  modeLabel: string;
}

const LOW_QUOTA_RATIO = 0.15;

export function QuotaMeter({ status, remaining, limit, actor, modeLabel }: QuotaState) {
  const messages = useI18n();
  const ready = status === "ready" && limit > 0;
  const ratio = ready ? Math.min(1, Math.max(0, remaining / limit)) : 0;
  const value = ready
    ? `${remaining} / ${limit}`
    : status === "loading"
      ? messages.quotaLoading
      : messages.quotaUnavailable;

  return (
    <section className="quota-meter" aria-label={messages.quotaTitle}>
      <div className="quota-meter-head">
        <span className="quota-meter-label">{messages.quotaTitle}</span>
        <span className="quota-meter-value" data-state={status}>
          {value}
        </span>
      </div>
      <div className="quota-meter-track" aria-hidden="true">
        <span
          className="quota-meter-fill"
          data-level={ready && ratio <= LOW_QUOTA_RATIO ? "low" : "normal"}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className="quota-meter-note">
        <span>{modeLabel}</span>
        {ready && <span className="quota-meter-actor">{actor}</span>}
      </p>
    </section>
  );
}
