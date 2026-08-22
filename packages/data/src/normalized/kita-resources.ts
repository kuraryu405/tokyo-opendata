import kitaMyanmarPopulationJson from "./kita-myanmar-population.json";
import { getPopulationCacheRecord } from "../adapters/population-cache";
import type { LocalResource, MunicipalityCrisisProfile, PopulationCache } from "../adapters/types";

export const kitaMyanmarPopulationCache = kitaMyanmarPopulationJson as PopulationCache;
const kitaMyanmarPopulation = getPopulationCacheRecord(kitaMyanmarPopulationCache, "13117", "Myanmar");

/**
 * Curated source-backed records for a stable demo, not a complete inventory of
 * Kita City facilities. Coordinates are intentionally absent: no coordinates
 * were inferred from an address.
 */
export const localResources: LocalResource[] = [
  { id: "kita-school-toyokawa", name: "豊川小学校", category: "school", municipality: "Kita", address: "東京都北区豊島3-10-23", phone: "03-3913-4111", website: "https://www.city.kita.lg.jp/education/elementary/toyokawa/about/2000897.html", description: "Kita City elementary school.", sourceId: "KITA_SCHOOL_PAGES" },
  { id: "kita-school-ukima", name: "浮間小学校", category: "school", municipality: "Kita", address: "東京都北区浮間3-4-27", phone: "03-3969-0491", website: "https://www.city.kita.lg.jp/education/elementary/ukima/about/2001975.html", description: "Kita City elementary school.", sourceId: "KITA_SCHOOL_PAGES", dataUpdatedAt: "2026-06-25" },
  { id: "kita-school-jujo", name: "十条小学校", category: "school", municipality: "Kita", address: "東京都北区中十条3-1-6", phone: "03-3908-3949", website: "https://www.city.kita.lg.jp/education/elementary/jujo/about/2001282.html", description: "Kita City elementary school.", sourceId: "KITA_SCHOOL_PAGES", dataUpdatedAt: "2026-04-08" },
  { id: "kita-school-nishigaoka", name: "西が丘小学校", category: "school", municipality: "Kita", address: "東京都北区西が丘1-12-14", phone: "03-3900-8866", website: "https://www.city.kita.lg.jp/education/elementary/nishigaoka/about/2002206.html", description: "Kita City elementary school. The official page says it has a Japanese-language class and巡回拠点; confirm current support directly.", sourceId: "KITA_SCHOOL_PAGES", dataUpdatedAt: "2026-04-30" },
  { id: "kita-medical-oji-kids", name: "おうじキッズクリニック", category: "medical", municipality: "Kita", address: "東京都北区王子5-1-40 サミットストア王子桜田通り店2階12号室", phone: "03-3914-1511", description: "Clinic; the source lists pediatrics (小). Confirm services and appointment requirements directly.", sourceId: "KITA_MEDICAL_LIST_2026_05", dataUpdatedAt: "2026-05-28" },
  { id: "kita-medical-kominato", name: "小湊小児科医院", category: "medical", municipality: "Kita", address: "東京都北区王子5-2-2-108", phone: "03-3927-2272", description: "Clinic; the source lists internal medicine and pediatrics (内、小). Confirm services and appointment requirements directly.", sourceId: "KITA_MEDICAL_LIST_2026_05", dataUpdatedAt: "2026-05-28" },
  { id: "kita-medical-shikada", name: "しかだこどもクリニック", category: "medical", municipality: "Kita", address: "東京都北区堀船3-38-3", phone: "03-3911-5228", description: "Clinic; the source lists pediatrics (小). Confirm services and appointment requirements directly.", sourceId: "KITA_MEDICAL_LIST_2026_05", dataUpdatedAt: "2026-05-28" },
  { id: "kita-child-akabane-kita", name: "赤羽北児童館", category: "child_support", municipality: "Kita", address: "東京都北区赤羽北1-5-5", phone: "03-3906-1149", description: "Children's hall. Confirm current programmes and eligibility directly.", sourceId: "KITA_CHILD_CENTER_LIST", dataUpdatedAt: "2026-04-23" },
  { id: "kita-child-kamiya", name: "神谷子どもセンター", category: "child_support", municipality: "Kita", address: "東京都北区神谷3-35-17", phone: "03-3902-3306", description: "Children's centre. Confirm current programmes and eligibility directly.", sourceId: "KITA_CHILD_CENTER_LIST", dataUpdatedAt: "2026-04-23" },
  { id: "kita-child-jujodai", name: "十条台子どもセンター", category: "child_support", municipality: "Kita", address: "東京都北区中十条1-2-18", phone: "03-3905-7120", description: "Children's centre. Confirm current programmes and eligibility directly.", sourceId: "KITA_CHILD_CENTER_LIST", dataUpdatedAt: "2026-04-23" },
  { id: "kita-library-central", name: "中央図書館", category: "public_facility", municipality: "Kita", address: "東京都北区十条台1-2-5", phone: "03-5993-1125", website: "https://www.library.city.kita.lg.jp/viewer/info.html?id=46&idSubTop=0", description: "Kita City library.", sourceId: "KITA_LIBRARY_LIST", dataUpdatedAt: "2026-08-04" },
  { id: "kita-library-toyoshima", name: "豊島図書館", category: "public_facility", municipality: "Kita", address: "東京都北区豊島3-27-22 豊島区民センター1階", phone: "03-3927-3421", website: "https://www.library.city.kita.lg.jp/viewer/info.html?id=46&idSubTop=0", description: "Kita City library.", sourceId: "KITA_LIBRARY_LIST", dataUpdatedAt: "2026-08-04" },
];

export const kitaMyanmarProfile: MunicipalityCrisisProfile = {
  municipalityCode: "13117",
  municipalityName: "Kita",
  targetNationality: "Myanmar",
  residentPopulation: kitaMyanmarPopulation.residentPopulation,
  populationSourceId: kitaMyanmarPopulationCache.sourceId,
  populationDataUpdatedAt: kitaMyanmarPopulationCache.dataUpdatedAt,
  populationFetchedAt: kitaMyanmarPopulationCache.fetchedAt,
  resourceCounts: { school: 4, medical: 3, child_support: 3, public_facility: 2 },
  coverageNotes: [
    "Resident population is from Tokyo Metropolitan Government's 2026-01-01 statistic; it does not represent short-term visitors.",
    "Resource counts are only the curated source-backed cache used by this MVP, not citywide capacity or a complete facility count.",
    "Facility count does not indicate available places, eligibility, language capacity, or quality of support."
  ],
  dataGapIds: ["short-term-visitor-distribution", "facility-capacity", "language-capacity", "real-time-availability"],
};

export const municipalityProfiles: MunicipalityCrisisProfile[] = [kitaMyanmarProfile];

export const dataGaps = [
  { id: "short-term-visitor-distribution", category: "population", title: "Short-term visitor distribution is unavailable", description: "Resident population statistics do not show where short-term visitors currently stay.", whyItMatters: "People affected by a sudden crisis may not appear in resident statistics." },
  { id: "facility-capacity", category: "capacity", title: "Facility capacity is not included", description: "The cached lists identify facilities, not vacancies, appointment availability, or ability to accept additional users.", whyItMatters: "A facility count must not be interpreted as available support." },
  { id: "language-capacity", category: "language", title: "Language support is not uniformly published", description: "The selected source lists do not provide a verified, current language-by-facility service field.", whyItMatters: "Users should confirm interpretation and language support before visiting." },
  { id: "real-time-availability", category: "operations", title: "Real-time service availability is unavailable", description: "Opening hours, closures and appointment requirements may change after the source update date.", whyItMatters: "Direct confirmation is required before travel." },
] as const;
