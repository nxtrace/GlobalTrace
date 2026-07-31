import { Filter, Info, List, ListChecks, MapPin, Plus, X } from "lucide-react";
import {
  probeNetworkKind,
  probeToMagic,
  summarizeProbeLocation,
  type ProbeFilterSuggestions,
} from "../../shared/filters";
import type { GlobalpingProbe, TraceFilters } from "../../shared/types";
import { ExactFiltersForm } from "./filter-panel/ExactFiltersForm";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Surface } from "./ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useI18n } from "../i18n";

const EMPTY_FILTER_SUGGESTIONS: ProbeFilterSuggestions = {
  countries: [],
  cities: [],
  asns: [],
  asnNetworks: {},
  networks: [],
  tags: [],
  magicStrings: [],
};

interface ProbeTableProps {
  probes: GlobalpingProbe[];
  matchedCount?: number;
  totalProbes: number;
  status: "loading" | "ready" | "error";
  filters?: TraceFilters;
  filterSuggestions?: ProbeFilterSuggestions;
  selectionActive?: boolean;
  browseAll?: boolean;
  listFilterActive?: boolean;
  isProbeSelected?: (probe: GlobalpingProbe) => boolean;
  onBrowseAllChange?: (browseAll: boolean) => void;
  onClearListFilter?: () => void;
  onFiltersChange?: (filters: TraceFilters) => void;
  onPick: (probe: GlobalpingProbe) => void;
  onFocus?: (probe: GlobalpingProbe) => void;
  onFilter?: (probe: GlobalpingProbe) => void;
  onRemove?: (probe: GlobalpingProbe) => void;
}

export function ProbeTable({
  probes,
  matchedCount = probes.length,
  totalProbes,
  status,
  filters = {},
  filterSuggestions = EMPTY_FILTER_SUGGESTIONS,
  selectionActive = false,
  browseAll = false,
  listFilterActive = false,
  isProbeSelected,
  onBrowseAllChange,
  onClearListFilter,
  onFiltersChange,
  onPick,
  onFocus,
  onFilter,
  onRemove,
}: ProbeTableProps) {
  const messages = useI18n();
  const visibleRows = probes.slice(0, 160);
  const showSelectionBrowse = Boolean(selectionActive && onBrowseAllChange);
  const showListFilterBack = Boolean(!selectionActive && listFilterActive && onClearListFilter);
  const exactFilterActive = hasExactFilter(filters);

  return (
    <Surface asChild className="probe-table-section">
      <section>
        <div className="section-header probe-table-header">
          <div className="probe-table-heading">
            <div className="probe-table-title-row">
              <h2>{messages.onlineProbes}</h2>
              <Badge variant="accent" className="probe-table-count">
                {matchedCount}
              </Badge>
            </div>
          </div>
          {onFiltersChange ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  className={`probe-table-filter-button${exactFilterActive ? " is-active" : ""}`}
                  aria-label={messages.filter}
                >
                  <Filter size={12} />
                  {messages.filter}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="probe-table-filter-popover"
                align="end"
                side="bottom"
                collisionPadding={12}
                onOpenAutoFocus={(event) => event.preventDefault()}
              >
                <div className="probe-table-filter-popover-header">
                  <Filter size={14} aria-hidden="true" />
                  <span>{messages.exactFilters}</span>
                </div>
                <ExactFiltersForm
                  className="exact-filters-form probe-table-filter-form"
                  filters={filters}
                  filterSuggestions={filterSuggestions}
                  onFiltersChange={onFiltersChange}
                />
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
        <div className="probe-table-body">
          <div className="table-scroll">
            <Table className="probe-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{messages.location}</TableHead>
                  <TableHead>ASN</TableHead>
                  <TableHead>network</TableHead>
                  <TableHead>tag</TableHead>
                  <TableHead aria-label={messages.select} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((probe, index) => {
                  const selected = Boolean(selectionActive && isProbeSelected?.(probe));
                  const locationLabel = probe.location.city || probe.location.country;
                  return (
                    <TableRow
                      key={`${probe.location.country}-${probe.location.city}-${probe.location.asn}-${index}`}
                      className={`probe-table-row${selected ? " is-selected" : ""}`}
                      data-selected={selected ? "true" : undefined}
                      onClick={() => onFilter?.(probe)}
                    >
                      <TableCell title={summarizeProbeLocation(probe)}>
                        {probe.location.city || "-"}, {probe.location.country}
                      </TableCell>
                      <TableCell>AS{probe.location.asn}</TableCell>
                      <TableCell>{probe.location.network}</TableCell>
                      <TableCell>
                        <ProbeTags probe={probe} />
                      </TableCell>
                      <TableCell>
                        <div className="probe-table-row-actions">
                          {onFocus ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              title={messages.locateProbeTitle(probeToMagic(probe))}
                              aria-label={messages.locateProbeLabel(locationLabel, probe.location.asn)}
                              onClick={(event) => {
                                event.stopPropagation();
                                onFocus(probe);
                              }}
                            >
                              <MapPin size={16} />
                            </Button>
                          ) : null}
                          {selected ? (
                            <div className="probe-table-added-actions">
                              <span className="probe-table-added">{messages.alreadyAdded}</span>
                              <button
                                type="button"
                                className="probe-table-remove"
                                aria-label={messages.removeAddedProbe(
                                  probe.location.network || locationLabel,
                                  `AS${probe.location.asn}`,
                                )}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRemove?.(probe);
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              title={messages.selectProbeTitle(probeToMagic(probe))}
                              aria-label={messages.selectProbeLabel(locationLabel, probe.location.asn)}
                              onClick={(event) => {
                                event.stopPropagation();
                                onPick(probe);
                              }}
                            >
                              <Plus size={16} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {status === "ready" && probes.length === 0 ? (
            <p className="table-empty">{messages.noTableProbes}</p>
          ) : null}
          {showSelectionBrowse ? (
            <button
              type="button"
              className="probe-table-fab"
              aria-pressed={browseAll}
              onClick={() => onBrowseAllChange?.(!browseAll)}
            >
              {browseAll ? <ListChecks size={14} aria-hidden="true" /> : <List size={14} aria-hidden="true" />}
              <span>{browseAll ? messages.showSelectedProbes : messages.showAllProbes}</span>
            </button>
          ) : null}
          {showListFilterBack ? (
            <button type="button" className="probe-table-fab" onClick={onClearListFilter}>
              <List size={14} aria-hidden="true" />
              <span>{messages.showAllProbes}</span>
            </button>
          ) : null}
        </div>
        <div className="probe-table-footer">
          <p className="probe-table-match">
            {messages.tableSubtitle(status, matchedCount, totalProbes)}
          </p>
          {probes.length > visibleRows.length ? (
            <p className="probe-table-tip">
              <Info size={12} aria-hidden="true" />
              <span>{messages.tableLimitNote(visibleRows.length)}</span>
            </p>
          ) : null}
        </div>
      </section>
    </Surface>
  );
}

function ProbeTags({ probe }: { probe: GlobalpingProbe }) {
  const kind = probeNetworkKind(probe);
  if (!kind) return <span className="muted">-</span>;
  return <Badge className={`kind-badge ${kind}`}>{kind}</Badge>;
}

function hasExactFilter(filters: TraceFilters): boolean {
  return Boolean(
    filters.country?.trim() ||
      filters.city?.trim() ||
      filters.asn?.trim() ||
      filters.network?.trim() ||
      filters.tag?.trim() ||
      filters.eyeball ||
      filters.datacenter,
  );
}
