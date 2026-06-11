import { describe, expect, it } from "vitest";
import {
  buildMagicFromFilters,
  filterChips,
  filterProbes,
  filterSummaryText,
  magicFromSelectedProbes,
  probeFilterSuggestions,
  probeToMagic,
} from "./filters";
import type { GlobalpingProbe } from "./types";

const probes: GlobalpingProbe[] = [
  {
    version: "0.48.0",
    location: {
      continent: "EU",
      region: "Western Europe",
      country: "DE",
      state: null,
      city: "Falkenstein",
      asn: 24940,
      latitude: 50.48,
      longitude: 12.37,
      network: "Hetzner Online",
    },
    tags: ["datacenter-network"],
  },
  {
    version: "0.48.0",
    location: {
      continent: "NA",
      region: "Northern America",
      country: "US",
      state: "CA",
      city: "Los Angeles",
      asn: 7922,
      latitude: 34.05,
      longitude: -118.24,
      network: "Comcast",
    },
    tags: ["eyeball-network"],
  },
];

describe("shared filters", () => {
  it("builds Globalping magic strings from structured filters", () => {
    expect(
      buildMagicFromFilters({
        country: "DE",
        asn: "24940",
        datacenter: true,
      }),
    ).toEqual(["DE+AS24940+datacenter-network"]);
    expect(buildMagicFromFilters({ magic: "world", country: "US" })).toEqual(["US"]);
  });

  it("honors advanced magic input over structured filters", () => {
    expect(buildMagicFromFilters({ magic: "US+Comcast, DE+Hetzner", country: "JP" })).toEqual([
      "US+Comcast",
      "DE+Hetzner",
    ]);
  });

  it("filters probes by country, network kind, and ASN", () => {
    expect(filterProbes(probes, { country: "US", eyeball: true })).toHaveLength(1);
    expect(filterProbes(probes, { asn: "AS24940", datacenter: true })[0]?.location.city).toBe(
      "Falkenstein",
    );
    expect(filterProbes(probes, { magic: "Los Angeles+US+AS7922+eyeball-network" })).toHaveLength(1);
    expect(filterProbes(probes, { magic: "DE+Hetzner" })[0]?.location.city).toBe("Falkenstein");
  });

  it("builds input suggestions from online probes", () => {
    const suggestions = probeFilterSuggestions([
      probes[1],
      probes[0],
      {
        ...probes[1],
        location: {
          ...probes[1].location,
          city: "",
          network: "",
        },
      },
    ]);

    expect(suggestions).toEqual({
      countries: ["DE", "US"],
      cities: ["Falkenstein", "Los Angeles"],
      asns: ["AS7922", "AS24940"],
      networks: ["Comcast", "Hetzner Online"],
    });
  });

  it("narrows input suggestions with other structured filters", () => {
    const suggestions = probeFilterSuggestions(probes, {
      country: "US",
      network: "Hetzner Online",
      magic: "DE+Hetzner",
    });

    expect(suggestions.networks).toEqual(["Comcast"]);
    expect(suggestions.countries).toEqual(["DE"]);
    expect(probeFilterSuggestions(probes, { country: "US", eyeball: true }).asns).toEqual(["AS7922"]);
  });

  it("turns a map-selected probe into a best-effort magic selector", () => {
    expect(probeToMagic(probes[0])).toBe("Falkenstein+DE+AS24940+datacenter-network");
    expect(probeToMagic(probes[0])).not.toContain("Hetzner");
  });

  it("summarizes filters as chips and text", () => {
    expect(filterChips({ country: "US", eyeball: true })).toEqual([
      { key: "country", label: "国家/地区", value: "US" },
      { key: "eyeball", label: "类型", value: "eyeball" },
    ]);
    expect(filterSummaryText({ magic: "DE+Hetzner" })).toBe("magic: DE+Hetzner");
  });

  it("caps selected probes at the GlobalTrace limit", () => {
    const manyProbes = Array.from({ length: 12 }, (_, index) => ({
      ...probes[1],
      location: {
        ...probes[1].location,
        city: `Los Angeles ${index}`,
        asn: 7900 + index,
      },
    }));
    const selection = magicFromSelectedProbes(manyProbes, 10);
    expect(selection.selectedCount).toBe(10);
    expect(selection.capped).toBe(true);
    expect(selection.magic).not.toContain("Comcast");
  });
});
