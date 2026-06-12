import { describe, expect, it } from "vitest";
import {
  buildMagicFromFilters,
  filterChips,
  filterProbes,
  filterSummaryText,
  magicStringMatchesQuery,
  magicFromSelectedProbes,
  normalizeMagicFiltersForProbes,
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

const chinaAs4134Probes: GlobalpingProbe[] = ["Shenzhen", "Nanning", "Guangzhou", "Shenzhou"].map((city, index) => ({
  version: "0.48.0",
  location: {
    continent: "AS",
    region: "Eastern Asia",
    country: "CN",
    state: null,
    city,
    asn: 4134,
    latitude: 22.54 + index,
    longitude: 114.05 + index,
    network: "China Telecom",
  },
  tags: [index === 3 ? "datacenter-network" : "eyeball-network"],
}));

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
    expect(filterProbes(probes, { magic: "US+Comcast" })[0]?.location.city).toBe("Los Angeles");
    expect(filterProbes(probes, { magic: "Comcast+US" })[0]?.location.city).toBe("Los Angeles");
    expect(filterProbes(probes, { magic: "US+AS7922+Com" })[0]?.location.city).toBe("Los Angeles");
    expect(filterProbes(chinaAs4134Probes, { magic: "AS4134+CN" })).toHaveLength(4);
    expect(filterProbes(chinaAs4134Probes, { magic: "CN+AS4134" })).toHaveLength(4);
  });

  it("matches magic suggestion tokens without requiring fixed order", () => {
    expect(magicStringMatchesQuery("Shenzhen+CN+AS4134+eyeball-network", "AS4134+CN")).toBe(true);
    expect(magicStringMatchesQuery("Shenzhen+CN+AS4134+eyeball-network", "CN+4134")).toBe(true);
    expect(magicStringMatchesQuery("CN+Shanghai", "CN+Sha")).toBe(true);
    expect(magicStringMatchesQuery("CN+AS4134+eyeball-network", "CN+eye")).toBe(true);
    expect(magicStringMatchesQuery("US+Comcast", "Comcast+US")).toBe(true);
    expect(magicStringMatchesQuery("US+AS7922+Comcast", "US+7922+Com")).toBe(true);
    expect(magicStringMatchesQuery("Shenzhen+CN+AS4134+eyeball-network", "AS4134+DE")).toBe(false);
  });

  it("normalizes small multi-token magic filters against current probes", () => {
    expect(normalizeMagicFiltersForProbes({ magic: "AS4134+CN" }, chinaAs4134Probes, 10)).toEqual({
      magic: [
        "Shenzhen+CN+AS4134+eyeball-network",
        "Nanning+CN+AS4134+eyeball-network",
        "Guangzhou+CN+AS4134+eyeball-network",
        "Shenzhou+CN+AS4134+datacenter-network",
      ].join(", "),
    });
    expect(normalizeMagicFiltersForProbes({ magic: "CN" }, chinaAs4134Probes, 10)).toEqual({ magic: "CN" });
    expect(normalizeMagicFiltersForProbes({ magic: "AS64500+CN" }, chinaAs4134Probes, 10)).toEqual({ magic: "AS64500+CN" });

    const manyProbes = Array.from({ length: 11 }, (_, index) => ({
      ...chinaAs4134Probes[0],
      location: { ...chinaAs4134Probes[0].location, city: `China ${index}` },
    }));
    expect(normalizeMagicFiltersForProbes({ magic: "AS4134+CN" }, manyProbes, 10)).toEqual({ magic: "AS4134+CN" });
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
      tags: ["datacenter-network", "eyeball-network"],
      magicStrings: [
        "US+Los Angeles",
        "US+AS7922",
        "US+Comcast",
        "US+AS7922+Comcast",
        "DE+Falkenstein",
        "DE+AS24940",
        "DE+Hetzner Online",
        "DE+AS24940+Hetzner Online",
        "Los Angeles+US+AS7922+eyeball-network",
        "Falkenstein+DE+AS24940+datacenter-network",
        "US+AS7922+eyeball-network",
      ],
    });

    expect(probeFilterSuggestions([
      {
        ...chinaAs4134Probes[0],
        location: { ...chinaAs4134Probes[0].location, city: "Shanghai" },
      },
    ]).magicStrings).toEqual([
      "CN+Shanghai",
      "CN+AS4134",
      "CN+China Telecom",
      "CN+AS4134+China Telecom",
      "Shanghai+CN+AS4134+eyeball-network",
    ]);
    expect(probeFilterSuggestions([
      {
        ...chinaAs4134Probes[0],
        location: { ...chinaAs4134Probes[0].location, city: "Shanghai" },
      },
    ]).magicStrings).not.toContain("CN+AS4134+eyeball-network");
  });

  it("narrows input suggestions with other structured filters", () => {
    const suggestions = probeFilterSuggestions(probes, {
      country: "US",
      network: "Hetzner Online",
      magic: "DE+Hetzner",
    });

    expect(suggestions.networks).toEqual(["Comcast"]);
    expect(suggestions.countries).toEqual(["DE"]);
    expect(probeFilterSuggestions(probes, { country: "US" }).tags).toEqual(["eyeball-network"]);
    expect(probeFilterSuggestions(probes, { country: "US", eyeball: true }).asns).toEqual(["AS7922"]);
    expect(probeFilterSuggestions(probes, { country: "US", magic: "DE+Hetzner" }).magicStrings).toEqual([
      "US+Los Angeles",
      "US+AS7922",
      "US+Comcast",
      "US+AS7922+Comcast",
      "Los Angeles+US+AS7922+eyeball-network",
    ]);
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
