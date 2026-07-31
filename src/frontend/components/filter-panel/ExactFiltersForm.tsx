import {
  asnSuggestionLabel,
  type ProbeFilterSuggestions,
} from "../../../shared/filters";
import { useMemo } from "react";
import type { TraceFilters } from "../../../shared/types";
import { countrySuggestionLabel } from "../../lib/countryNames";
import { useI18n } from "../../i18n";
import { Switch } from "../ui/switch";
import { SuggestionInput } from "./suggestions";

export interface ExactFiltersFormProps {
  filters: TraceFilters;
  filterSuggestions: ProbeFilterSuggestions;
  onFiltersChange: (filters: TraceFilters) => void;
  className?: string;
}

export function ExactFiltersForm({
  filters,
  filterSuggestions,
  onFiltersChange,
  className = "exact-filters-form",
}: ExactFiltersFormProps) {
  const messages = useI18n();
  const countryOptions = useMemo(
    () =>
      filterSuggestions.countries
        .map((code) => {
          const label = countrySuggestionLabel(code, messages.locale);
          return {
            value: code,
            label,
            searchText: `${label} ${code}`,
          };
        })
        .sort((left, right) =>
          left.label.localeCompare(right.label, messages.locale),
        ),
    [filterSuggestions.countries, messages.locale],
  );
  const asnOptions = useMemo(
    () =>
      filterSuggestions.asns.map((asn) => {
        const label = asnSuggestionLabel(asn, filterSuggestions.asnNetworks);
        return {
          value: asn,
          label,
          searchText: `${label} ${asn}`,
        };
      }),
    [filterSuggestions.asnNetworks, filterSuggestions.asns],
  );

  const setFilter = (key: keyof TraceFilters, value: string | boolean) => {
    const nextValue = cleanFilterValue(value);
    onFiltersChange({
      ...filters,
      magic: undefined,
      [key]: nextValue,
    });
  };

  return (
    <div className={className}>
      <div className="control-grid">
        <label className="field-label">
          <span>{messages.countryRegion}</span>
          <SuggestionInput
            label={messages.countryRegion}
            value={filters.country || ""}
            options={countryOptions}
            onChange={(value) => setFilter("country", value)}
          />
        </label>
        <label className="field-label">
          <span>{messages.city}</span>
          <SuggestionInput
            label={messages.city}
            value={filters.city || ""}
            options={filterSuggestions.cities}
            onChange={(value) => setFilter("city", value)}
          />
        </label>
        <label className="field-label field-label-wide">
          <span>ASN</span>
          <SuggestionInput
            label="ASN"
            value={filters.asn || ""}
            options={asnOptions}
            onChange={(value) => setFilter("asn", value)}
          />
        </label>
        <label className="field-label field-label-wide">
          <span>network</span>
          <SuggestionInput
            label="network"
            value={filters.network || ""}
            options={filterSuggestions.networks}
            onChange={(value) => setFilter("network", value)}
          />
        </label>
        <label className="field-label field-label-wide">
          <span>tag</span>
          <SuggestionInput
            label="tag"
            value={filters.tag || ""}
            options={filterSuggestions.tags}
            onChange={(value) => setFilter("tag", value)}
          />
        </label>
      </div>

      <div className="segmented" aria-label={messages.networkType}>
        <label className={filters.eyeball ? "selected" : ""}>
          <span>Eyeball</span>
          <Switch
            size="sm"
            checked={Boolean(filters.eyeball)}
            onCheckedChange={(checked) => setFilter("eyeball", Boolean(checked))}
            aria-label="Eyeball"
          />
        </label>
        <label className={filters.datacenter ? "selected" : ""}>
          <span>Datacenter</span>
          <Switch
            size="sm"
            checked={Boolean(filters.datacenter)}
            onCheckedChange={(checked) =>
              setFilter("datacenter", Boolean(checked))
            }
            aria-label="Datacenter"
          />
        </label>
      </div>
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
