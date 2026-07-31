import { X } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { ProbePickerGroup, ProbePickerState } from "./types";
import { useI18n } from "../../i18n";

const PROBE_PICKER_HEADER_HEIGHT = 40;
const PROBE_PICKER_LIST_PADDING = 8;
const PROBE_PICKER_ROW_HEIGHT = 40;
const PROBE_PICKER_ROW_GAP = 4;

interface ProbePickerProps {
  picker: ProbePickerState;
  selectedProbeGroupKey: string | null;
  addedProbeGroupKeys: ReadonlySet<string>;
  onClose: () => void;
  onPickGroup: (group: ProbePickerGroup) => void;
  onRemoveGroup: (group: ProbePickerGroup) => void;
}

export function ProbePicker({
  picker,
  selectedProbeGroupKey,
  addedProbeGroupKeys,
  onClose,
  onPickGroup,
  onRemoveGroup,
}: ProbePickerProps) {
  const messages = useI18n();
  const title = locationTitle(picker);
  const groupCount = picker.groups.length;
  return (
    <div
      className={picker.pinned ? "probe-picker pinned" : "probe-picker"}
      style={{ left: picker.left, top: picker.top, height: probePickerHeight(groupCount) }}
      role="dialog"
      aria-label={messages.probeCandidates(title)}
    >
      <header className="probe-picker-header">
        <div className="probe-picker-header-title">
          <strong>{title}</strong>
          {picker.country ? <span className="probe-picker-chip">{picker.country}</span> : null}
          <span className="probe-picker-chip probe-picker-chip-count">+ {picker.total}</span>
        </div>
        <button
          type="button"
          className="probe-picker-close"
          aria-label={messages.closeProbeCandidates}
          tabIndex={picker.pinned ? 0 : -1}
          aria-hidden={picker.pinned ? undefined : true}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </header>
      <div className="probe-picker-list" role="listbox" aria-label={messages.probeAsnCandidates}>
        {picker.groups.map((group) => {
          const added = addedProbeGroupKeys.has(group.key);
          const selected = selectedProbeGroupKey === group.key || added;
          return (
            <div
              className={`probe-picker-row${added ? " is-added" : ""}`}
              role="option"
              tabIndex={added ? -1 : 0}
              aria-selected={selected}
              aria-label={`${group.network} ${group.asn} ×${group.count}${added ? ` ${messages.alreadyAdded}` : ""}`}
              key={group.key}
              onClick={() => {
                if (!added) onPickGroup(group);
              }}
              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                if (added) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onPickGroup(group);
              }}
            >
              <span className="probe-picker-row-pick">
                <span className="probe-picker-row-name" title={group.network}>
                  {group.network}
                </span>
                <span className="probe-picker-row-meta">
                  {group.asn} ×{group.count}
                </span>
              </span>
              <span className="probe-picker-added-actions" aria-hidden={added ? undefined : true}>
                <span className="probe-picker-added">{messages.alreadyAdded}</span>
                <button
                  type="button"
                  className="probe-picker-remove"
                  tabIndex={added ? 0 : -1}
                  aria-label={messages.removeAddedProbe(group.network, group.asn)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRemoveGroup(group);
                  }}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function probePickerHeight(groupCount: number): number {
  return (
    PROBE_PICKER_HEADER_HEIGHT +
    PROBE_PICKER_LIST_PADDING +
    Math.max(groupCount, 0) * PROBE_PICKER_ROW_HEIGHT +
    Math.max(groupCount - 1, 0) * PROBE_PICKER_ROW_GAP
  );
}

function locationTitle(location: Pick<ProbePickerState, "city" | "country">): string {
  return location.city || location.country || "Globalping";
}
