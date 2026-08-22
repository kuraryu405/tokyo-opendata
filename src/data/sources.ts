import kitaMyanmarPopulationJson from "./normalized/kita-myanmar-population.json";
import type { PopulationCache } from "./adapters/types";
import type { NeedCategory, VisitPurpose } from "../domain/types";
import { supportCopy, type LocalizedSupportText, type SupportLocale } from "./support-copy";

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
  notes: string | LocalizedSupportText;
  /** Short line describing what answer is written on the official page (text-first handoff). */
  answersInText?: LocalizedSupportText;
  /** Visit purposes that establish this source's audience. Omit when no purpose-based restriction applies. */
  eligibleVisitPurposes?: readonly VisitPurpose[];
  license?: string;
};

const fetchedAt = "2026-08-14";
const fetchedAtToday = "2026-08-22";
const kitaMyanmarPopulationCache = kitaMyanmarPopulationJson as PopulationCache;

export const sourceRegistry: Record<string, DataSource> = {
  TOKYO_FOREIGN_POPULATION_2026_01: {
    id: "TOKYO_FOREIGN_POPULATION_2026_01",
    title: "Foreign population, January 2026: municipality and nationality/region",
    publisher: "Tokyo Metropolitan Government, Bureau of General Affairs, Statistics Division",
    url: "https://www.toukei.metro.tokyo.lg.jp/gaikoku/2026/ga26ev0300.csv",
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
    ...supportCopy.TOKYO_CONSULTATION,
  },
  ISA: {
    id: "ISA",
    title: "Immigration Services Agency consultation information",
    publisher: "Immigration Services Agency of Japan",
    url: "https://www.moj.go.jp/isa/consultation/center/",
    sourceType: "official_information",
    category: "residence procedures consultation",
    fetchedAt,
    ...supportCopy.ISA,
  },
  FRESC: {
    id: "FRESC",
    title: "Foreign Residents Support Center (FRESC) contacts",
    publisher: "Immigration Services Agency of Japan",
    url: "https://www.moj.go.jp/isa/support/fresc/fresc_4.html?hl=en",
    sourceType: "official_information",
    category: "foreign resident support consultation",
    fetchedAt,
    ...supportCopy.FRESC,
  },
  TMC_NAVI: {
    id: "TMC_NAVI",
    title: "Tokyo Multilingual Consultation Navi (TMC Navi)",
    publisher: "Tokyo Metropolitan Government, Bureau of Citizens and Cultural Affairs",
    url: "https://www.seikatubunka.metro.tokyo.lg.jp/chiiki_tabunka/tabunka/tabunkasuishin/0000001565",
    sourceType: "official_information",
    category: "multilingual consultation",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TMC_NAVI,
    eligibleVisitPurposes: ["resident"],
  },
  TOKYO_FRAC: {
    id: "TOKYO_FRAC",
    title: "Foreign Residents' Advisory Center (FRAC)",
    publisher: "Tokyo Metropolitan Government, Bureau of Citizens and Cultural Affairs",
    url: "https://www.seikatubunka.metro.tokyo.lg.jp/about/0000002541",
    sourceType: "official_information",
    category: "foreign resident consultation",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_FRAC,
  },
  TIPS_CONSULTATIONS: {
    id: "TIPS_CONSULTATIONS",
    title: "Consultations (TIPS Tokyo Intercultural Portal Site)",
    publisher: "Tokyo Metropolitan Foundation 'TSUNAGARI'",
    url: "https://tabunka.tokyo-tsunagari.or.jp/english/soudan/easy.html",
    sourceType: "official_information",
    category: "consultation portal",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TIPS_CONSULTATIONS,
  },
  TMG_CONSULTATION_KURASHI: {
    id: "TMG_CONSULTATION_KURASHI",
    title: "Tokyo Metropolitan Government consultation and counter guide (daily life)",
    publisher: "Tokyo Metropolitan Government",
    url: "https://www.metro.tokyo.lg.jp/tosei/iken-sodan/sodan/kurashi",
    sourceType: "official_information",
    category: "consultation guide",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TMG_CONSULTATION_KURASHI,
  },
  TOKYO_FRESC_STATUS_CONSULT: {
    id: "TOKYO_FRESC_STATUS_CONSULT",
    title: "Free Consultation for Status of Residence (TMC Navi / TSUNAGARI)",
    publisher: "Tokyo Metropolitan Foundation 'TSUNAGARI'",
    url: "https://tabunka.tokyo-tsunagari.or.jp/english/info/2022/05/220512-tagengosodan.html",
    sourceType: "official_information",
    category: "status of residence consultation",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_FRESC_STATUS_CONSULT,
    eligibleVisitPurposes: ["resident", "work", "study"],
  },
  TOKYO_HOUSING_SUPPORT: {
    id: "TOKYO_HOUSING_SUPPORT",
    title: "Housing support (Tokyo Metropolitan Government Bureau of Social Welfare and Public Health)",
    publisher: "Tokyo Metropolitan Government, Bureau of Social Welfare and Public Health",
    url: "https://www.fukushi.metro.tokyo.lg.jp/seikatsu/seikatsu_kyoju_shuro/sumai",
    sourceType: "official_information",
    category: "housing support",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_HOUSING_SUPPORT,
  },
  TOKYO_SCHOOL_ENROLL_EN: {
    id: "TOKYO_SCHOOL_ENROLL_EN",
    title: "Enrollment in Public Elementary and Junior High Schools (TMG)",
    publisher: "Tokyo Metropolitan Government",
    url: "https://www.english.metro.tokyo.lg.jp/w/031-101-003827",
    sourceType: "official_information",
    category: "school enrollment",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_SCHOOL_ENROLL_EN,
  },
  TOKYO_SCHOOL_ATTENDANCE_BOE: {
    id: "TOKYO_SCHOOL_ATTENDANCE_BOE",
    title: "Enrollment of foreign nationals in public elementary/junior high schools (Tokyo BOE)",
    publisher: "Tokyo Metropolitan Board of Education",
    url: "https://www.kyoiku.metro.tokyo.lg.jp/school/japanese/learning_japanese/school_attendance_for_foreign_people",
    sourceType: "official_information",
    category: "school enrollment",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_SCHOOL_ATTENDANCE_BOE,
  },
  MEXT_SCHOOL: {
    id: "MEXT_SCHOOL",
    title: "Procedures for enrollment of foreign nationals (MEXT)",
    publisher: "Ministry of Education, Culture, Sports, Science and Technology (MEXT)",
    url: "https://www.mext.go.jp/a_menu/shotou/shugaku/detail/1422256.htm",
    sourceType: "official_information",
    category: "school enrollment",
    fetchedAt: fetchedAtToday,
    ...supportCopy.MEXT_SCHOOL,
  },
  TIPS_SCHOOL: {
    id: "TIPS_SCHOOL",
    title: "Elementary and junior high schools (TIPS)",
    publisher: "Tokyo Metropolitan Foundation 'TSUNAGARI'",
    url: "https://tabunka.tokyo-tsunagari.or.jp/useful/guide_eng/school/02.html",
    sourceType: "official_information",
    category: "school enrollment",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TIPS_SCHOOL,
  },
  TOKYO_CHILDCARE_SUPPORT: {
    id: "TOKYO_CHILDCARE_SUPPORT",
    title: "Child rearing support (Tokyo Metropolitan Government)",
    publisher: "Tokyo Metropolitan Government",
    url: "https://www.metro.tokyo.lg.jp/kyoiku/child-education/kosodateshien",
    sourceType: "official_information",
    category: "childcare support",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_CHILDCARE_SUPPORT,
  },
  TOKYO_CHILD_GUIDANCE: {
    id: "TOKYO_CHILD_GUIDANCE",
    title: "Tokyo Child Guidance Office",
    publisher: "Tokyo Metropolitan Government, Bureau of Social Welfare and Public Health",
    url: "https://www.fukushi.metro.tokyo.lg.jp/shisetsu/jicen/english",
    sourceType: "official_information",
    category: "child guidance",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_CHILD_GUIDANCE,
  },
  TOKYO_MEDICAL_INFO: {
    id: "TOKYO_MEDICAL_INFO",
    title: "Tokyo Medical Information Site for Foreign Tourists and Residents",
    publisher: "Tokyo Metropolitan Government, Bureau of Health and Welfare",
    url: "https://www.hokeniryo.metro.tokyo.lg.jp/iryo/iryo_hoken/medical_info_eng",
    sourceType: "official_information",
    category: "medical information",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_MEDICAL_INFO,
  },
  TOKYO_MEDICAL_FLOW: {
    id: "TOKYO_MEDICAL_FLOW",
    title: "Procedures for visiting medical institutions (Tokyo Medical Information Site)",
    publisher: "Tokyo Metropolitan Government, Bureau of Health and Welfare",
    url: "https://www.hokeniryo.metro.tokyo.lg.jp/iryo/iryo_hoken/medical_info_eng/flow",
    sourceType: "official_information",
    category: "medical information",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_MEDICAL_FLOW,
  },
  TOKYO_MEDICAL_HIMAWARI: {
    id: "TOKYO_MEDICAL_HIMAWARI",
    title: "Medical information service for foreign patients (HIMAWARI)",
    publisher: "Tokyo Metropolitan Government, Bureau of Health and Welfare",
    url: "https://www.hokeniryo.metro.tokyo.lg.jp/iryo/iryo_hoken/medical_info_eng/himawari",
    sourceType: "official_information",
    category: "medical information",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_MEDICAL_HIMAWARI,
  },
  TOKYO_MEDICAL_TMCNAVI: {
    id: "TOKYO_MEDICAL_TMCNAVI",
    title: "Tokyo Multilingual Consultation Navi (Tokyo Medical Information Site)",
    publisher: "Tokyo Metropolitan Government, Bureau of Health and Welfare",
    url: "https://www.hokeniryo.metro.tokyo.lg.jp/iryo/iryo_hoken/medical_info_eng/tmc_navi",
    sourceType: "official_information",
    category: "medical information",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_MEDICAL_TMCNAVI,
  },
  TOKYO_MEDICAL_GAIKOKUGO: {
    id: "TOKYO_MEDICAL_GAIKOKUGO",
    title: "Medical information services for foreigners (Tokyo Medical Information Site)",
    publisher: "Tokyo Metropolitan Government, Bureau of Health and Welfare",
    url: "https://www.hokeniryo.metro.tokyo.lg.jp/iryo/sodan/komatta/gaikokugo",
    sourceType: "official_information",
    category: "medical information",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_MEDICAL_GAIKOKUGO,
  },
  TOKYO_LABOR_CONSULT: {
    id: "TOKYO_LABOR_CONSULT",
    title: "Labor Consultation Service for Foreign Workers (TOKYO Hataraku Net)",
    publisher: "Tokyo Metropolitan Government, Bureau of Labor",
    url: "https://www.hataraku.metro.tokyo.lg.jp/sodan/sodan/foreign.html",
    sourceType: "official_information",
    category: "labor consultation",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_LABOR_CONSULT,
  },
  TOKYO_FOREIGN_WORKERS_HANDBOOK: {
    id: "TOKYO_FOREIGN_WORKERS_HANDBOOK",
    title: "Foreign Workers' Handbook (TOKYO Hataraku Net)",
    publisher: "Tokyo Metropolitan Government, Bureau of Labor",
    url: "https://www.hataraku.metro.tokyo.lg.jp/shiryo/foreign-e/index.html",
    sourceType: "official_information",
    category: "labor information",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_FOREIGN_WORKERS_HANDBOOK,
  },
  TOKYO_CAREER_CONSULT: {
    id: "TOKYO_CAREER_CONSULT",
    title: "TOKYO Career Consulting Desk (TOKYO Career Guide)",
    publisher: "Tokyo Metropolitan Government",
    url: "https://www.tdh.metro.tokyo.lg.jp/english/contact/consultation/",
    sourceType: "official_information",
    category: "employment support",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TOKYO_CAREER_CONSULT,
  },
  HELLO_WORK_TOKYO_FOREIGNER: {
    id: "HELLO_WORK_TOKYO_FOREIGNER",
    title: "Tokyo Employment Service Center for Foreigners (Hello Work)",
    publisher: "Ministry of Health, Labour and Welfare, Tokyo Labour Bureau",
    url: "https://jsite.mhlw.go.jp/tokyo-foreigner/english/seekers_1.html",
    sourceType: "official_information",
    category: "employment support",
    fetchedAt: fetchedAtToday,
    ...supportCopy.HELLO_WORK_TOKYO_FOREIGNER,
  },
  TIPS_JAPANESE: {
    id: "TIPS_JAPANESE",
    title: "Tokyo Intercultural Portal Site (TIPS) - Learning Japanese",
    publisher: "Tokyo Metropolitan Foundation 'TSUNAGARI'",
    url: "https://tabunka.tokyo-tsunagari.or.jp/english/index.html",
    sourceType: "official_information",
    category: "japanese learning",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TIPS_JAPANESE,
  },
  TIPS_LIVING_GUIDE: {
    id: "TIPS_LIVING_GUIDE",
    title: "Tokyo Living Beginner's Guide (TIPS)",
    publisher: "Tokyo Metropolitan Foundation 'TSUNAGARI'",
    url: "https://tabunka.tokyo-tsunagari.or.jp/english/useful/yourguide.html",
    sourceType: "official_information",
    category: "daily life guide",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TIPS_LIVING_GUIDE,
  },
  TIPS_PROCEDURES: {
    id: "TIPS_PROCEDURES",
    title: "Procedures Required When Living in Japan (TIPS)",
    publisher: "Tokyo Metropolitan Foundation 'TSUNAGARI'",
    url: "https://tabunka.tokyo-tsunagari.or.jp/english/topics/tips/tokyo_2606.html",
    sourceType: "official_information",
    category: "daily life guide",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TIPS_PROCEDURES,
  },
  TIPS_LIFE_GUIDE_JP: {
    id: "TIPS_LIFE_GUIDE_JP",
    title: "生活ガイド（外国人のための生活ガイド・TIPS）",
    publisher: "Tokyo Metropolitan Foundation 'TSUNAGARI'",
    url: "https://tabunka.tokyo-tsunagari.or.jp/useful/guide/index.html",
    sourceType: "official_information",
    category: "daily life guide",
    fetchedAt: fetchedAtToday,
    ...supportCopy.TIPS_LIFE_GUIDE_JP,
  },
  KEISHICHO_FOREIGN_RESIDENT_MANUAL: {
    id: "KEISHICHO_FOREIGN_RESIDENT_MANUAL",
    title: "Foreign Resident Manual (Tokyo Metropolitan Police Department)",
    publisher: "Tokyo Metropolitan Police Department",
    url: "https://www.keishicho.metro.tokyo.lg.jp/multilingual/english/for_residents/index.files/04_english.pdf",
    sourceType: "official_information",
    category: "daily life guide",
    fetchedAt: fetchedAtToday,
    ...supportCopy.KEISHICHO_FOREIGN_RESIDENT_MANUAL,
  },
};

/** Array form for components that render a source list. */
export const sources = Object.values(sourceRegistry);

export const getSource = (id: string): DataSource | undefined => sourceRegistry[id];

export const getLocalizedSourceText = (
  source: DataSource,
  field: "answersInText" | "notes",
  locale: SupportLocale,
): string | undefined => {
  const localized = source[field];
  if (!localized || typeof localized === "string") return undefined;
  return localized[locale].trim() || undefined;
};

export const isSourceEligibleForVisitPurpose = (source: DataSource, visitPurpose: VisitPurpose): boolean =>
  source.eligibleVisitPurposes?.includes(visitPurpose) ?? true;

/**
 * Consultation/guidance sources shown for each selected need, each pointing to a
 * page where the answer is written in text (not only a phone number).
 * These are rendered in the "official information" section of the help screen.
 */
export const consultationSourcesByNeed: Record<NeedCategory, string[]> = {
  stay: ["TOKYO_FRESC_STATUS_CONSULT"],
  consultation: ["TIPS_CONSULTATIONS", "TMG_CONSULTATION_KURASHI"],
  accommodation: ["TOKYO_HOUSING_SUPPORT"],
  living_cost: ["TOKYO_HOUSING_SUPPORT"],
  education: ["TOKYO_SCHOOL_ENROLL_EN", "TOKYO_SCHOOL_ATTENDANCE_BOE", "MEXT_SCHOOL", "TIPS_SCHOOL"],
  childcare: ["TOKYO_CHILDCARE_SUPPORT", "TOKYO_CHILD_GUIDANCE"],
  medical: ["TOKYO_MEDICAL_INFO", "TOKYO_MEDICAL_FLOW", "TOKYO_MEDICAL_HIMAWARI", "TOKYO_MEDICAL_TMCNAVI", "TOKYO_MEDICAL_GAIKOKUGO"],
  employment: ["TOKYO_LABOR_CONSULT", "TOKYO_FOREIGN_WORKERS_HANDBOOK", "TOKYO_CAREER_CONSULT", "HELLO_WORK_TOKYO_FOREIGNER"],
  language: ["TIPS_JAPANESE"],
  daily_life: ["TIPS_LIVING_GUIDE", "TIPS_PROCEDURES", "TIPS_LIFE_GUIDE_JP", "KEISHICHO_FOREIGN_RESIDENT_MANUAL"],
};

/** Always-available human-handoff desks, rendered in their own section. */
export const humanHandoffSourceIds: string[] = ["TMC_NAVI", "TOKYO_FRAC", "FRESC"];
