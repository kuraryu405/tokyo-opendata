import { describe, expect, it } from "vitest";
import { adaptResourceRecord, adaptTokyoForeignPopulation } from "../src/data/adapters/open-data";
import { filterLocalResources, getPopulationCacheRecord, localResources, municipalityProfiles, sourceRegistry } from "../src/data";
import populationCacheJson from "../src/data/normalized/kita-myanmar-population.json";
import type { PopulationCache } from "../src/data/adapters/types";

describe("open-data adapters", () => {
  it("normalizes only fields that exist in a public source row", () => {
    expect(adaptResourceRecord({ "施設名称": "Example Centre", "所在地": "Kita 1-2-3", "電話番号": "03-0000-0000" }, {
      id: "example", category: "child_support", municipality: "Kita", sourceId: "TEST", dataUpdatedAt: "2026-01-01",
    })).toMatchObject({ name: "Example Centre", address: "Kita 1-2-3", phone: "03-0000-0000" });
  });

  it("does not turn a missing name into a fabricated resource", () => {
    expect(adaptResourceRecord({ "住所": "Kita 1-2-3" }, { id: "missing", category: "school", municipality: "Kita", sourceId: "TEST" })).toBeUndefined();
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

  it("tracks the current Kita City medical PDF for every cached medical facility", () => {
    const medical = localResources.filter((resource) => resource.category === "medical");
    expect(medical.map((resource) => resource.name)).toEqual(["おうじキッズクリニック", "小湊小児科医院", "しかだこどもクリニック"]);
    expect(medical.every((resource) => resource.sourceId === "KITA_MEDICAL_LIST_2026_05" && resource.dataUpdatedAt === "2026-05-28")).toBe(true);
    expect(sourceRegistry.KITA_MEDICAL_LIST_2026_05).toMatchObject({
      title: "Pamphlet: Kita City hospitals, clinics and dental clinics list",
      url: "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/008/500/r8_hospital_clinic_list.pdf",
      dataUpdatedAt: "2026-05-28",
      fetchedAt: "2026-08-14",
    });
  });
});
