import type { GlobalpingProbe, ProbeLocation, TraceFilters } from "./types";

const EYEBALL_TAGS = new Set(["eyeball", "eyeball-network"]);
const DATACENTER_TAGS = new Set(["datacenter", "datacenter-network"]);
const WORLD_MAGIC = "world";

export function compactText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeAsn(value: string | number | undefined): string {
  const raw = compactText(value);
  if (!raw) return "";
  const digits = raw.replace(/^AS/i, "").trim();
  return digits ? `AS${digits}` : "";
}

export function hasNetworkKind(tags: string[], kind: "eyeball" | "datacenter"): boolean {
  const normalized = tags.map((tag) => tag.toLowerCase());
  const expected = kind === "eyeball" ? EYEBALL_TAGS : DATACENTER_TAGS;
  return normalized.some((tag) => expected.has(tag));
}

export function buildMagicFromFilters(filters: TraceFilters | undefined): string[] {
  const magic = activeMagic(filters);
  if (magic) {
    return splitMagicList(magic);
  }

  const parts = [
    compactText(filters?.country),
    compactText(filters?.city),
    normalizeAsn(filters?.asn),
    compactText(filters?.network),
    compactText(filters?.tag),
    filters?.eyeball ? "eyeball-network" : "",
    filters?.datacenter ? "datacenter-network" : "",
  ].filter(Boolean);

  if (parts.length === 0) {
    return ["world"];
  }
  return [parts.join("+")];
}

export function splitMagicList(value: string): string[] {
  const locations = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return locations.length ? locations : ["world"];
}

export function probeToMagic(probe: GlobalpingProbe): string {
  const location = probe.location;
  const parts = [
    location.city,
    location.country,
    normalizeAsn(location.asn),
    hasNetworkKind(probe.tags, "datacenter") ? "datacenter-network" : "",
    hasNetworkKind(probe.tags, "eyeball") ? "eyeball-network" : "",
  ].filter(Boolean);
  return parts.join("+") || WORLD_MAGIC;
}

export function filterProbes(probes: GlobalpingProbe[], filters: TraceFilters): GlobalpingProbe[] {
  return probes.filter((probe) => probeMatchesFilters(probe, filters));
}

export interface ProbeFilterSuggestions {
  countries: string[];
  cities: string[];
  asns: string[];
  networks: string[];
}

export function probeFilterSuggestions(probes: GlobalpingProbe[], filters: TraceFilters = {}): ProbeFilterSuggestions {
  return {
    countries: uniqueSorted(suggestionProbes(probes, filters, "country").map((probe) => probe.location.country)),
    cities: uniqueSorted(suggestionProbes(probes, filters, "city").map((probe) => probe.location.city)),
    asns: uniqueSorted(
      suggestionProbes(probes, filters, "asn").map((probe) => normalizeAsn(probe.location.asn)),
      compareAsn,
    ),
    networks: uniqueSorted(suggestionProbes(probes, filters, "network").map((probe) => probe.location.network)),
  };
}

export function probeMatchesFilters(probe: GlobalpingProbe, filters: TraceFilters): boolean {
  const magic = activeMagic(filters);
  if (magic) {
    return splitMagicList(magic).some((item) => probeMatchesMagic(probe, item));
  }

  const location = probe.location;
  return (
    includesText(location.country, filters.country) &&
    includesText(location.city, filters.city) &&
    includesText(location.network, filters.network) &&
    matchesAsn(location, filters.asn) &&
    matchesTag(probe.tags, filters.tag) &&
    (!filters.eyeball || hasNetworkKind(probe.tags, "eyeball")) &&
    (!filters.datacenter || hasNetworkKind(probe.tags, "datacenter"))
  );
}

function activeMagic(filters: TraceFilters | undefined): string {
  const magic = compactText(filters?.magic);
  return magic && magic.toLowerCase() !== WORLD_MAGIC ? magic : "";
}

function probeMatchesMagic(probe: GlobalpingProbe, magic: string): boolean {
  const tokens = magic
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length || tokens.some((token) => token.toLowerCase() === WORLD_MAGIC)) return true;
  return tokens.every((token) => probeMatchesMagicToken(probe, token));
}

function probeMatchesMagicToken(probe: GlobalpingProbe, token: string): boolean {
  const normalizedAsn = normalizeAsn(token);
  if (/^(AS)?\d+$/i.test(compactText(token))) {
    return normalizeAsn(probe.location.asn) === normalizedAsn;
  }
  const normalized = token.toLowerCase();
  if (EYEBALL_TAGS.has(normalized)) return hasNetworkKind(probe.tags, "eyeball");
  if (DATACENTER_TAGS.has(normalized)) return hasNetworkKind(probe.tags, "datacenter");
  return (
    includesText(probe.location.country, token) ||
    includesText(probe.location.city, token) ||
    includesText(probe.location.state, token) ||
    includesText(probe.location.region, token) ||
    includesText(probe.location.continent, token) ||
    includesText(probe.location.network, token) ||
    matchesTag(probe.tags, token)
  );
}

function includesText(value: string | null | undefined, query: string | undefined): boolean {
  const needle = compactText(query).toLowerCase();
  if (!needle) return true;
  return compactText(value).toLowerCase().includes(needle);
}

function matchesAsn(location: ProbeLocation, query: string | undefined): boolean {
  const normalized = normalizeAsn(query);
  if (!normalized) return true;
  return normalizeAsn(location.asn) === normalized;
}

function matchesTag(tags: string[], query: string | undefined): boolean {
  const needle = compactText(query).toLowerCase();
  if (!needle) return true;
  return tags.some((tag) => tag.toLowerCase().includes(needle));
}

export function summarizeProbeLocation(probe: GlobalpingProbe): string {
  const { city, state, country, network, asn } = probe.location;
  const place = [city, state, country].filter(Boolean).join(", ");
  const asnText = asn ? `AS${asn}` : "";
  return [place, network, asnText].filter(Boolean).join(" / ");
}

export interface FilterChip {
  key: string;
  label: string;
  value: string;
}

export function filterChips(filters: TraceFilters | undefined): FilterChip[] {
  const out: FilterChip[] = [];
  const magic = activeMagic(filters);
  if (magic) {
    out.push({ key: "magic", label: "magic", value: magic });
    return out;
  }

  addChip(out, "country", "国家/地区", filters?.country);
  addChip(out, "city", "城市", filters?.city);
  addChip(out, "asn", "ASN", normalizeAsn(filters?.asn));
  addChip(out, "network", "network", filters?.network);
  addChip(out, "tag", "tag", filters?.tag);
  if (filters?.eyeball) out.push({ key: "eyeball", label: "类型", value: "eyeball" });
  if (filters?.datacenter) out.push({ key: "datacenter", label: "类型", value: "datacenter" });
  if (out.length === 0) out.push({ key: WORLD_MAGIC, label: "范围", value: WORLD_MAGIC });
  return out;
}

export function filterSummaryText(filters: TraceFilters | undefined): string {
  return filterChips(filters)
    .map((chip) => `${chip.label}: ${chip.value}`)
    .join(" / ");
}

export function magicFromSelectedProbes(
  probes: GlobalpingProbe[],
  maxProbes = 10,
): { magic: string; selectedCount: number; capped: boolean } {
  const allMagic = Array.from(new Set(probes.map(probeToMagic)));
  const selected = allMagic.slice(0, maxProbes);
  return {
    magic: selected.join(", ") || WORLD_MAGIC,
    selectedCount: selected.length,
    capped: allMagic.length > maxProbes,
  };
}

export function probeNetworkKind(probe: GlobalpingProbe): "eyeball" | "datacenter" | "other" {
  if (hasNetworkKind(probe.tags, "eyeball")) return "eyeball";
  if (hasNetworkKind(probe.tags, "datacenter")) return "datacenter";
  return "other";
}

function addChip(out: FilterChip[], key: string, label: string, value: unknown): void {
  const compacted = compactText(value);
  if (compacted) out.push({ key, label, value: compacted });
}

function uniqueSorted(values: Iterable<unknown>, compareFn?: (left: string, right: string) => number): string[] {
  return Array.from(new Set(Array.from(values, compactText).filter(Boolean))).sort(compareFn);
}

function compareAsn(left: string, right: string): number {
  const leftNumber = Number(left.replace(/^AS/i, ""));
  const rightNumber = Number(right.replace(/^AS/i, ""));
  return leftNumber - rightNumber || left.localeCompare(right);
}

function suggestionProbes(
  probes: GlobalpingProbe[],
  filters: TraceFilters,
  excludedField: "country" | "city" | "asn" | "network",
): GlobalpingProbe[] {
  return filterProbes(probes, { ...filters, magic: undefined, [excludedField]: undefined });
}
