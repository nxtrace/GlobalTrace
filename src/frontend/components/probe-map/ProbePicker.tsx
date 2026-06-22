import { X } from "lucide-react";
import { Badge } from "../ui/badge";
import type { ProbePickerGroup, ProbePickerState } from "./types";
import { useI18n } from "../../i18n";

interface ProbePickerProps {
  picker: ProbePickerState;
  selectedProbeGroupKey: string | null;
  onClose: () => void;
  onPickGroup: (group: ProbePickerGroup) => void;
}

export function ProbePicker({
  picker,
  selectedProbeGroupKey,
  onClose,
  onPickGroup,
}: ProbePickerProps) {
  const messages = useI18n();
  const title = locationTitle(picker);
  return (
    <div
      className={picker.pinned ? "probe-picker pinned" : "probe-picker"}
      style={{ left: picker.left, top: picker.top }}
      role="dialog"
      aria-label={messages.probeCandidates(title)}
    >
      <header className="probe-picker-header">
        <div>
          <strong>{title}</strong>
          {picker.country && <span>{picker.country}</span>}
        </div>
        <Badge variant="accent">+ {picker.total}</Badge>
        {picker.pinned && (
          <button
            type="button"
            className="probe-picker-close"
            aria-label={messages.closeProbeCandidates}
            onClick={onClose}
          >
            <X size={17} />
          </button>
        )}
      </header>
      <div className="probe-picker-list" role="listbox" aria-label={messages.probeAsnCandidates}>
        {picker.groups.map((group) => (
          <button
            type="button"
            role="option"
            aria-label={`${group.network} ${group.asn} ×${group.count}`}
            aria-selected={selectedProbeGroupKey === group.key}
            className="probe-picker-row"
            key={group.key}
            onClick={() => onPickGroup(group)}
          >
            <span title={group.network}>{group.network}</span>
            <small>
              {group.asn} ×{group.count}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}

function locationTitle(location: Pick<ProbePickerState, "city" | "country">): string {
  return location.city || location.country || "Globalping";
}
