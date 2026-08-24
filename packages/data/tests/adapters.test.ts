import { describe, expect, it } from "vitest";
import { adaptResourceRecord, adaptTokyoForeignPopulation } from "../src/adapters/open-data";
import { filterLocalResources, getPopulationCacheRecord, kitaMyanmarProfile, localResources, municipalityProfiles, schoolSelection, selectResources, sourceRegistry } from "../src";
import populationCacheJson from "../src/normalized/kita-myanmar-population.json";
import type { PopulationCache } from "../src/adapters/types";

describe("open-data adapters", () => {
  it("normalizes only fields that exist in a public source row", () => {
    expect(adaptResourceRecord({ "施設名": "Example Centre", "所在地_連結表記": "Kita 1-2-3", "電話番号": "03-0000-0000", "緯度": "35.7", "経度": "139.7" }, {
      id: "example", category: "child_support", municipality: "Kita", sourceId: "TEST", dataUpdatedAt: "2026-01-01",
    })).toMatchObject({ name: "Example Centre", address: "Kita 1-2-3", phone: "03-0000-0000", latitude: 35.7, longitude: 139.7 });
  });

  it("does not invent blank optional values", () => {
    expect(adaptResourceRecord({ "名称": "Example Centre", "所在地": " ", "緯度": "not-a-number" }, {
      id: "example", category: "child_support", municipality: "Kita", sourceId: "TEST",
    })).toEqual({ id: "example", name: "Example Centre", category: "child_support", municipality: "Kita", sourceId: "TEST" });
  });

  it("does not turn a missing name into a fabricated resource", () => {
    expect(adaptResourceRecord({ "住所": "Kita 1-2-3" }, { id: "missing", category: "school", municipality: "Kita", sourceId: "TEST" })).toBeUndefined();
  });

  it("fails closed when a selected record disappears or its current address drifts", () => {
    const jujo = schoolSelection.find((selection) => selection.name === "十条小学校");
    const nishigaoka = schoolSelection.find((selection) => selection.name === "西が丘小学校");
    expect(jujo).toBeTruthy();
    expect(nishigaoka).toBeTruthy();
    expect(() => selectResources([{ "施設名": "十条台小学校", "住所": "東京都北区中十条1丁目5番6号" }], [jujo!])).toThrow("十条小学校 was not found");
    expect(() => selectResources([{ "施設名": "西が丘小学校", "住所": "東京都北区十条仲原4丁目5番17号" }], [nishigaoka!])).toThrow(/identity\/address check/);
  });

  it("uses current school identity checks only to validate source rows, never to fabricate them", () => {
    const jujo = schoolSelection.find((selection) => selection.name === "十条小学校");
    const nishigaoka = schoolSelection.find((selection) => selection.name === "西が丘小学校");
    const resources = selectResources([
      { "施設名": "十条小学校", "住所": "東京都北区中十条3-1-6" },
      { "施設名": "西が丘小学校", "住所": "東京都北区西が丘1-12-14" },
    ], [jujo!, nishigaoka!]);
    expect(resources).toMatchObject([
      { name: "十条小学校", address: "東京都北区中十条3-1-6" },
      { name: "西が丘小学校", address: "東京都北区西が丘1-12-14" },
    ]);
  });

  it("keeps a numeric Myanmar resident-population value", () => {
    expect(adaptTokyoForeignPopulation({ "地域コード": "13117", "国・地域(人)": "北区", "ミャンマー": "3540" })).toEqual({ municipalityCode: "13117", municipalityName: "北区", targetNationality: "Myanmar", residentPopulation: 3540 });
  });

  it("filters the curated cache by municipality and category", () => {
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

  it("does not expose stale school rows in the bundled cache", () => {
    expect(localResources.filter((resource) => resource.category === "school")).toEqual([]);
    expect(localResources.map((resource) => resource.name)).not.toContain("十条台小学校");
    expect(localResources.map((resource) => resource.name)).not.toContain("西が丘小学校");
  });

  it("keeps every bundled facility attributable to adapted CC BY 4.0 Kita Open Data", () => {
    const expectedSourceIds = new Set([
      "KITA_ELEMENTARY_SCHOOLS_OPEN_DATA",
      "KITA_MEDICAL_INSTITUTIONS_OPEN_DATA",
      "KITA_CHILDCARE_FACILITIES_OPEN_DATA",
      "KITA_PUBLIC_FACILITIES_OPEN_DATA",
    ]);

    expect(localResources).toHaveLength(8);
    for (const resource of localResources) {
      const source = sourceRegistry[resource.sourceId];
      expect(expectedSourceIds.has(resource.sourceId)).toBe(true);
      expect(source).toMatchObject({ sourceType: "open_data", publisher: "東京都北区", adaptation: "selected_and_normalized", license: expect.stringContaining("CC BY 4.0"), fetchedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
      expect(source?.url).toBe("https://www.city.kita.lg.jp/city-information/disclosure/1014461.html");
      expect(source?.downloadUrl).toMatch(/^https:\/\//);
      expect(source?.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
      expect(resource.name.trim()).not.toBe("");
      expect(resource.address?.trim()).not.toBe("");
      expect(resource.latitude).toEqual(expect.any(Number));
      expect(resource.longitude).toEqual(expect.any(Number));
    }
  });

  it("derives municipal resource counts from the generated facility cache", () => {
    expect(kitaMyanmarProfile.resourceCounts).toEqual({ medical: 3, child_support: 3, public_facility: 2 });
  });
});
