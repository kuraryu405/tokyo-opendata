import kitaLocalResourcesJson from "./normalized/kita-local-resources.json";
import kitaMyanmarPopulationJson from "./normalized/kita-myanmar-population.json";
import type { LocalResourcesCache, PopulationCache } from "./adapters/types";
import { KITA_EARTHQUAKE_SHELTER_SOURCE } from "./source-descriptors";

export type SourceType = "official_information" | "open_data";

export type DataSource = {
  id: string;
  title: string;
  publisher: string;
  /** Human-readable source or catalog page used for attribution. */
  url: string;
  /** Machine-readable source used only by the cache refresh script. */
  downloadUrl?: string;
  sourceType: SourceType;
  category: string;
  dataUpdatedAt?: string;
  fetchedAt: string;
  license?: string;
  licenseUrl?: string;
  catalogUrl?: string;
  landingPageUrl?: string;
  landingPageUpdatedAt?: string;
  termsUrl?: string;
  attribution?: string;
  updateFrequency?: string;
  notes: string;
};

const kitaMyanmarPopulationCache = kitaMyanmarPopulationJson as PopulationCache;
const kitaLocalResourcesCache = kitaLocalResourcesJson as LocalResourcesCache;
const kitaOpenDataPageUrl = "https://www.city.kita.lg.jp/city-information/disclosure/1014461.html";
const kitaLicenseUrl = "https://creativecommons.org/licenses/by/4.0/";
const kitaLicense = "Creative Commons Attribution 4.0 International (CC BY 4.0)";
const officialInformationCheckedAt = "2026-08-14";

export const sourceRegistry: Record<string, DataSource> = {
  [KITA_EARTHQUAKE_SHELTER_SOURCE.id]: {
    ...KITA_EARTHQUAKE_SHELTER_SOURCE,
    sourceType: "open_data",
    category: "emergency shelters",
    fetchedAt: "2026-08-23",
    notes: KITA_EARTHQUAKE_SHELTER_SOURCE.coverageNote,
  },
  TOKYO_FOREIGN_POPULATION_2026_01: {
    id: "TOKYO_FOREIGN_POPULATION_2026_01",
    title: "Foreign population, January 2026: municipality and nationality/region",
    publisher: "Tokyo Metropolitan Government, Bureau of General Affairs, Statistics Division",
    url: "https://www.toukei.metro.tokyo.lg.jp/gaikoku/2026/ga26ev0300.csv",
    downloadUrl: "https://www.toukei.metro.tokyo.lg.jp/gaikoku/2026/ga26ev0300.csv",
    sourceType: "open_data",
    category: "foreign resident population",
    dataUpdatedAt: kitaMyanmarPopulationCache.dataUpdatedAt,
    fetchedAt: kitaMyanmarPopulationCache.fetchedAt,
    license: "CC BY (Tokyo Metropolitan Government Open Data Catalog)",
    notes: "Resident Basic Register population, not a count of short-term visitors. Cached row is limited to Kita City and Myanmar for this MVP.",
  },
  KITA_ELEMENTARY_SCHOOLS_OPEN_DATA: {
    id: "KITA_ELEMENTARY_SCHOOLS_OPEN_DATA", title: "区立小学校一覧", publisher: "東京都北区", url: kitaOpenDataPageUrl,
    downloadUrl: "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/syougakkou-2.csv", sourceType: "open_data", category: "elementary schools", fetchedAt: kitaLocalResourcesCache.fetchedAt,
    license: kitaLicense, licenseUrl: kitaLicenseUrl,
    notes: "The catalog lists this CSV as Open Data under CC BY 4.0. A school listing does not establish enrolment eligibility, catchment, vacancy, language support, or admission availability.",
  },
  KITA_MEDICAL_INSTITUTIONS_OPEN_DATA: {
    id: "KITA_MEDICAL_INSTITUTIONS_OPEN_DATA", title: "自治体標準オープンデータセット：医療機関一覧", publisher: "東京都北区", url: kitaOpenDataPageUrl,
    downloadUrl: "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip", sourceType: "open_data", category: "medical institutions", fetchedAt: kitaLocalResourcesCache.fetchedAt,
    license: kitaLicense, licenseUrl: kitaLicenseUrl,
    notes: "Rows are selected from 10_医療機関一覧.csv in the catalog's standard Open Data ZIP. Listing does not guarantee current services, appointments, hours, language support, or availability.",
  },
  KITA_CHILDCARE_FACILITIES_OPEN_DATA: {
    id: "KITA_CHILDCARE_FACILITIES_OPEN_DATA", title: "自治体標準オープンデータセット：子育て施設一覧", publisher: "東京都北区", url: kitaOpenDataPageUrl,
    downloadUrl: "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip", sourceType: "open_data", category: "child support facilities", fetchedAt: kitaLocalResourcesCache.fetchedAt,
    license: kitaLicense, licenseUrl: kitaLicenseUrl,
    notes: "Rows are selected from 05_子育て施設一覧.csv in the catalog's standard Open Data ZIP. They do not establish eligibility, capacity, current programmes, language support, or availability.",
  },
  KITA_PUBLIC_FACILITIES_OPEN_DATA: {
    id: "KITA_PUBLIC_FACILITIES_OPEN_DATA", title: "自治体標準オープンデータセット：公共施設一覧", publisher: "東京都北区", url: kitaOpenDataPageUrl,
    downloadUrl: "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip", sourceType: "open_data", category: "public facilities", fetchedAt: kitaLocalResourcesCache.fetchedAt,
    license: kitaLicense, licenseUrl: kitaLicenseUrl,
    notes: "Rows are selected from 01_公共施設一覧.csv in the catalog's standard Open Data ZIP. They do not establish current access, programme availability, language support, or eligibility.",
  },
  TOKYO_CONSULTATION: {
    id: "TOKYO_CONSULTATION", title: "Foreign Residents Support Center (FRESC) contacts", publisher: "Immigration Services Agency of Japan", url: "https://www.moj.go.jp/isa/support/fresc/fresc_4.html?hl=en", sourceType: "official_information", category: "consultation", fetchedAt: officialInformationCheckedAt,
    notes: "A national official consultation route used as the MVP's Tokyo access point; confirm current contact arrangements before calling or visiting.",
  },
  ISA: {
    id: "ISA", title: "Immigration Services Agency consultation information", publisher: "Immigration Services Agency of Japan", url: "https://www.moj.go.jp/isa/consultation/center/", sourceType: "official_information", category: "residence procedures consultation", fetchedAt: officialInformationCheckedAt,
    notes: "Provides general information and does not decide individual cases or permission prospects.",
  },
  FRESC: {
    id: "FRESC", title: "Foreign Residents Support Center (FRESC) contacts", publisher: "Immigration Services Agency of Japan", url: "https://www.moj.go.jp/isa/support/fresc/fresc_4.html?hl=en", sourceType: "official_information", category: "foreign resident support consultation", fetchedAt: officialInformationCheckedAt,
    notes: "Contact arrangements and services can change; confirm directly before visiting or calling.",
  },
};

export const sources = Object.values(sourceRegistry);
export const getSource = (id: string): DataSource | undefined => sourceRegistry[id];
