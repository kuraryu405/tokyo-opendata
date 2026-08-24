import { describe, expect, it } from "vitest";
import { actionCatalog } from "../src/domain/action-catalog";
import { adaptResourceRecord, adaptTokyoForeignPopulation } from "../src/data/adapters/open-data";
import { filterLocalResources, getPopulationCacheRecord, kitaMyanmarProfile, localResources, municipalityProfiles, sourceRegistry } from "../src/data";
import populationCacheJson from "../src/data/normalized/kita-myanmar-population.json";
import type { LocalResourceCategory, PopulationCache } from "../src/data/adapters/types";

describe("open-data adapters", () => {
  it("normalizes a verified Open Data row without changing its published values", () => {
    expect(adaptResourceRecord({
      "名称": "Example Centre", "所在地_連結表記": "東京都北区北 1-2-3", "電話番号": "03-0000-0000", "緯度": "35.7", "経度": "139.7",
    }, {
      id: "example", category: "child_support", municipality: "Kita", sourceId: "TEST",
    })).toEqual({
      id: "example", name: "Example Centre", category: "child_support", municipality: "Kita", address: "東京都北区北 1-2-3", phone: "03-0000-0000", latitude: 35.7, longitude: 139.7, sourceId: "TEST",
    });
  });

  it("does not turn a missing name into a fabricated resource", () => {
    expect(adaptResourceRecord({ "住所": "Kita 1-2-3" }, { id: "missing", category: "school", municipality: "Kita", sourceId: "TEST" })).toBeUndefined();
  });

  it("does not fill blank source fields with invented values", () => {
    expect(adaptResourceRecord({ "施設名": "Name only", "緯度": "" }, {
      id: "blank", category: "school", municipality: "Kita", sourceId: "TEST",
    })).toEqual({ id: "blank", name: "Name only", category: "school", municipality: "Kita", sourceId: "TEST" });
  });

  it("keeps a numeric Myanmar resident-population value", () => {
    expect(adaptTokyoForeignPopulation({ "地域コード": "13117", "国・地域(人)": "北区", "ミャンマー": "3540" })).toEqual({ municipalityCode: "13117", municipalityName: "北区", targetNationality: "Myanmar", residentPopulation: 3540 });
  });

  it("filters the bundled Open Data cache by municipality and category", () => {
    expect(filterLocalResources({ municipality: "Kita", category: "medical" })).toHaveLength(3);
    expect(filterLocalResources({ municipality: "Unknown" })).toEqual([]);
  });

  it("derives the Crisis View profile and source dates from the bundled population cache", () => {
    const cache = populationCacheJson as PopulationCache;
    const record = getPopulationCacheRecord(cache, "13117", "Myanmar");
    const profile = municipalityProfiles.find((item) => item.municipalityCode === "13117");
    expect(profile).toMatchObject({
      residentPopulation: record.residentPopulation,
      populationSourceId: cache.sourceId,
      populationDataUpdatedAt: cache.dataUpdatedAt,
      populationFetchedAt: cache.fetchedAt,
    });
    expect(sourceRegistry[cache.sourceId]).toMatchObject({ dataUpdatedAt: cache.dataUpdatedAt, fetchedAt: cache.fetchedAt });
  });

  it("fails rather than inventing a population when a cache record is absent", () => {
    expect(() => getPopulationCacheRecord({ sourceId: "TEST", fetchedAt: "2026-01-01", dataUpdatedAt: "2026-01-01", records: [], coverageNotes: [] }, "13117", "Myanmar")).toThrow("missing 13117/Myanmar");
  });

  it("uses only registry-backed Open Data sources with explicit licenses for Local Action facilities", () => {
    for (const resource of localResources) {
      const source = sourceRegistry[resource.sourceId];
      expect(source, `${resource.id} source`).toBeDefined();
      expect(source).toMatchObject({ sourceType: "open_data" });
      expect(source?.license).toContain("CC BY 4.0");
      expect(new URL(source?.url ?? "http://invalid").protocol).toBe("https:");
    }
  });

  it("derives resource counts from the same bundled Local Action resources", () => {
    const expected = localResources.reduce<Partial<Record<LocalResourceCategory, number>>>((counts, resource) => {
      counts[resource.category] = (counts[resource.category] ?? 0) + 1;
      return counts;
    }, {});
    expect(kitaMyanmarProfile.resourceCounts).toEqual(expected);
  });

  it("resolves every Action Catalog source ID through the canonical registry", () => {
    const actionSourceIds = Object.values(actionCatalog).flatMap((action) => action.sourceIds);
    expect(actionSourceIds).not.toContain("TOKYO_SCHOOL_DATA");
    expect(actionSourceIds).not.toContain("TOKYO_MEDICAL_DATA");
    expect(actionSourceIds).not.toContain("KITA_CHILD_CENTER_LIST");
    expect(actionSourceIds).not.toContain("KITA_LIBRARY_LIST");
    expect(actionSourceIds.every((sourceId) => Boolean(sourceRegistry[sourceId]))).toBe(true);
  });
});
