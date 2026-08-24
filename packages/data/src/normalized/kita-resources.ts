import kitaLocalResourcesJson from "./kita-local-resources.json";
import kitaMyanmarPopulationJson from "./kita-myanmar-population.json";
import { getPopulationCacheRecord } from "../adapters/population-cache";
import type { LocalResourceCategory, LocalResourcesCache, MunicipalityCrisisProfile, PopulationCache } from "../adapters/types";

export const kitaMyanmarPopulationCache = kitaMyanmarPopulationJson as PopulationCache;
export const kitaLocalResourcesCache = kitaLocalResourcesJson as LocalResourcesCache;
export const localResources = kitaLocalResourcesCache.resources;
/** IDs are stable UI keys; source-backed fields remain in the generated JSON cache. */
export type LocalResourceId = string;
const kitaMyanmarPopulation = getPopulationCacheRecord(kitaMyanmarPopulationCache, "13117", "Myanmar");
const resourceCounts = localResources.reduce<Partial<Record<LocalResourceCategory, number>>>((counts, resource) => { counts[resource.category] = (counts[resource.category] ?? 0) + 1; return counts; }, {});

export const kitaMyanmarProfile: MunicipalityCrisisProfile = {
  municipalityCode: "13117", municipalityName: "Kita", targetNationality: "Myanmar", residentPopulation: kitaMyanmarPopulation.residentPopulation,
  populationSourceId: kitaMyanmarPopulationCache.sourceId, populationDataUpdatedAt: kitaMyanmarPopulationCache.dataUpdatedAt, populationFetchedAt: kitaMyanmarPopulationCache.fetchedAt,
  resourceCounts,
  coverageNotes: ["Resident population is from Tokyo Metropolitan Government's 2026-01-01 statistic; it does not represent short-term visitors.", "Resource counts are derived from the curated, source-backed Open Data cache used by this MVP, not citywide capacity or a complete facility count.", "School resources are withheld because the published machine-readable school source currently conflicts with current identity/address checks.", "Facility count does not indicate available places, eligibility, language capacity, or quality of support."],
  dataGapIds: ["short-term-visitor-distribution", "facility-capacity", "language-capacity", "real-time-availability"],
};
export const municipalityProfiles: MunicipalityCrisisProfile[] = [kitaMyanmarProfile];
export const dataGaps = [
  { id: "short-term-visitor-distribution", category: "population", title: "Short-term visitor distribution is unavailable", description: "Resident population statistics do not show where short-term visitors currently stay.", whyItMatters: "People affected by a sudden crisis may not appear in resident statistics." },
  { id: "facility-capacity", category: "capacity", title: "Facility capacity is not included", description: "The cached lists identify facilities, not vacancies, appointment availability, or ability to accept additional users.", whyItMatters: "A facility count must not be interpreted as available support." },
  { id: "language-capacity", category: "language", title: "Language support is not uniformly published", description: "The selected source lists do not provide a verified, current language-by-facility service field.", whyItMatters: "Users should confirm interpretation and language support before visiting." },
  { id: "real-time-availability", category: "operations", title: "Real-time service availability is unavailable", description: "Opening hours, closures and appointment requirements may change after the source update date.", whyItMatters: "Direct confirmation is required before travel." },
] as const;
