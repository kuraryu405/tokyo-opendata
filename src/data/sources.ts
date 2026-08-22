import kitaMyanmarPopulationJson from "./normalized/kita-myanmar-population.json";
import type { PopulationCache } from "./adapters/types";
import { TOKYO_FOREIGN_POPULATION_SOURCE } from "./source-descriptors";

/**
 * A deliberately small registry of sources used by the MVP.  `fetchedAt` is
 * when this repository's cache was checked, not a claim that the publisher
 * updated its data on that day.
 */
export type SourceType = "official_information" | "open_data" | "official_public_list";

export type DataSource = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  sourceType: SourceType;
  category: string;
  dataUpdatedAt?: string;
  fetchedAt: string;
  notes: string;
  license?: string;
};

const fetchedAt = "2026-08-14";
const kitaMyanmarPopulationCache = kitaMyanmarPopulationJson as PopulationCache;

export const sourceRegistry: Record<string, DataSource> = {
  [TOKYO_FOREIGN_POPULATION_SOURCE.id]: {
    id: TOKYO_FOREIGN_POPULATION_SOURCE.id,
    title: "Foreign population, January 2026: municipality and nationality/region",
    publisher: "Tokyo Metropolitan Government, Bureau of General Affairs, Statistics Division",
    url: TOKYO_FOREIGN_POPULATION_SOURCE.url,
    sourceType: "open_data",
    category: "foreign resident population",
    dataUpdatedAt: kitaMyanmarPopulationCache.dataUpdatedAt,
    fetchedAt: kitaMyanmarPopulationCache.fetchedAt,
    license: "CC BY (Tokyo Metropolitan Government Open Data Catalog)",
    notes: "Resident Basic Register population, not a count of short-term visitors. Cached row is limited to Kita City and Myanmar for this MVP.",
  },
  KITA_SCHOOL_PAGES: {
    id: "KITA_SCHOOL_PAGES",
    title: "Kita City elementary school information pages",
    publisher: "Kita City Board of Education",
    url: "https://www.city.kita.lg.jp/education/elementary/index.html",
    sourceType: "official_public_list",
    category: "elementary schools",
    fetchedAt,
    notes: "A curated, non-exhaustive cache of official school pages. Listing a school does not establish enrolment eligibility, catchment, vacancy, language support, or admission availability.",
  },
  KITA_MEDICAL_LIST_2026_05: {
    id: "KITA_MEDICAL_LIST_2026_05",
    title: "Pamphlet: Kita City hospitals, clinics and dental clinics list",
    publisher: "Kita City Public Health Center",
    url: "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/008/500/r8_hospital_clinic_list.pdf",
    sourceType: "official_public_list",
    category: "medical institutions",
    dataUpdatedAt: "2026-05-28",
    fetchedAt,
    notes: "The official landing page was checked on 2026-08-14 and was updated 2026-07-01. The PDF reflects Health Center notifications as of 2026-05-28. Entries can change after publication; confirm directly before visiting.",
  },
  KITA_CHILD_CENTER_LIST: {
    id: "KITA_CHILD_CENTER_LIST",
    title: "Kita City children's centres and children's halls",
    publisher: "Kita City",
    url: "https://www.city.kita.lg.jp/children-edu/childcare/1002833/1007588/1008062/1008063.html",
    sourceType: "official_public_list",
    category: "child support facilities",
    dataUpdatedAt: "2026-04-23",
    fetchedAt,
    notes: "Public list of locations and telephone numbers. It does not state eligibility, current capacity, language availability, or programme availability.",
  },
  KITA_LIBRARY_LIST: {
    id: "KITA_LIBRARY_LIST",
    title: "Kita City library locations",
    publisher: "Kita City Library",
    url: "https://www.library.city.kita.lg.jp/viewer/info.html?id=46&idSubTop=0",
    sourceType: "official_public_list",
    category: "public facilities",
    dataUpdatedAt: "2026-08-04",
    fetchedAt,
    notes: "Public list of library locations and telephone numbers. Availability of services and language assistance must be confirmed with the facility.",
  },
  // These stable IDs are consumed by the action-rule layer. The resource cards
  // retain the more precise Kita-specific IDs above.
  TOKYO_SCHOOL_DATA: {
    id: "TOKYO_SCHOOL_DATA",
    title: "Kita City elementary school information pages",
    publisher: "Kita City Board of Education",
    url: "https://www.city.kita.lg.jp/education/elementary/index.html",
    sourceType: "official_public_list",
    category: "elementary schools",
    fetchedAt,
    notes: "The MVP currently covers a curated Kita City subset. A listed school is not an admission, catchment, or vacancy determination.",
  },
  TOKYO_MEDICAL_DATA: {
    id: "TOKYO_MEDICAL_DATA",
    title: "Pamphlet: Kita City hospitals, clinics and dental clinics list",
    publisher: "Kita City Public Health Center",
    url: "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/008/500/r8_hospital_clinic_list.pdf",
    sourceType: "official_public_list",
    category: "medical institutions",
    dataUpdatedAt: "2026-05-28",
    fetchedAt,
    notes: "The official landing page was checked on 2026-08-14 and was updated 2026-07-01. The PDF reflects Health Center notifications as of 2026-05-28; confirm with an institution before a visit.",
  },
  TOKYO_CONSULTATION: {
    id: "TOKYO_CONSULTATION",
    title: "Foreign Residents Support Center (FRESC) contacts",
    publisher: "Immigration Services Agency of Japan",
    url: "https://www.moj.go.jp/isa/support/fresc/fresc_4.html?hl=en",
    sourceType: "official_information",
    category: "consultation",
    fetchedAt,
    notes: "A national official consultation route used as the MVP's Tokyo access point; confirm current contact arrangements before calling or visiting.",
  },
  ISA: {
    id: "ISA",
    title: "Immigration Services Agency consultation information",
    publisher: "Immigration Services Agency of Japan",
    url: "https://www.moj.go.jp/isa/consultation/center/",
    sourceType: "official_information",
    category: "residence procedures consultation",
    fetchedAt,
    notes: "Provides general information and does not decide individual cases or permission prospects.",
  },
  FRESC: {
    id: "FRESC",
    title: "Foreign Residents Support Center (FRESC) contacts",
    publisher: "Immigration Services Agency of Japan",
    url: "https://www.moj.go.jp/isa/support/fresc/fresc_4.html?hl=en",
    sourceType: "official_information",
    category: "foreign resident support consultation",
    fetchedAt,
    notes: "Contact arrangements and services can change; confirm directly before visiting or calling.",
  },
};

/** Array form for components that render a source list. */
export const sources = Object.values(sourceRegistry);

export const getSource = (id: string): DataSource | undefined => sourceRegistry[id];
