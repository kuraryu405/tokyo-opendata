import type { LocalResourceCategory } from "./adapters/types";
import type { SelectedResource } from "./adapters/current-data";

export const KITA_FACILITY_DATASET_KEY = "KITA_LOCAL_FACILITIES";
export const KITA_FACILITY_SOURCE_UPDATED_AT = "2024-10-31";
export const KITA_FACILITY_EXPECTED_RESOURCE_COUNT = 12;

const landingPageUrl = "https://www.city.kita.lg.jp/city-information/disclosure/1014461.html";
const termsUrl = "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/kiyaku.pdf";
const license = "Creative Commons Attribution 4.0 International (CC BY 4.0)";
const licenseUrl = "https://creativecommons.org/licenses/by/4.0/";

export const KITA_ELEMENTARY_SCHOOLS_URL =
  "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/syougakkou-2.csv";
export const KITA_STANDARD_OPEN_DATA_URL =
  "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip";

export const KITA_FACILITY_SOURCES = [
  { id: "KITA_ELEMENTARY_SCHOOLS_OPEN_DATA", title: "区立小学校一覧", downloadUrl: KITA_ELEMENTARY_SCHOOLS_URL, category: "school" },
  { id: "KITA_MEDICAL_INSTITUTIONS_OPEN_DATA", title: "自治体標準オープンデータセット：医療機関一覧", downloadUrl: KITA_STANDARD_OPEN_DATA_URL, category: "medical" },
  { id: "KITA_CHILDCARE_FACILITIES_OPEN_DATA", title: "自治体標準オープンデータセット：子育て施設一覧", downloadUrl: KITA_STANDARD_OPEN_DATA_URL, category: "child_support" },
  { id: "KITA_PUBLIC_FACILITIES_OPEN_DATA", title: "自治体標準オープンデータセット：公共施設一覧", downloadUrl: KITA_STANDARD_OPEN_DATA_URL, category: "public_facility" },
].map((source) => ({
  ...source,
  publisher: "東京都北区",
  landingPageUrl,
  catalogUrl: landingPageUrl,
  termsUrl,
  license,
  licenseUrl,
  attribution: `${source.title}, 東京都北区, CC BY 4.0`,
  updateFrequency: "Irregular publisher updates; checked by manual sync",
  dataUpdatedAt: KITA_FACILITY_SOURCE_UPDATED_AT,
  coverageNote: "StayBridgeが既存Local Action用に選定した施設のみ。全施設、空き、受入可否、対応言語、現在のサービス状況を表さない。",
})) as readonly KitaFacilitySource[];

export type KitaFacilitySource = {
  id: string;
  title: string;
  publisher: string;
  landingPageUrl: string;
  downloadUrl: string;
  catalogUrl: string;
  termsUrl: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  updateFrequency: string;
  dataUpdatedAt: string;
  coverageNote: string;
  category: LocalResourceCategory;
};

export const KITA_STANDARD_SELECTIONS: Readonly<Record<string, readonly SelectedResource[]>> = {
  "10_医療機関一覧.csv": [
    { id: "kita-medical-oji-kids", name: "おうじキッズクリニック", category: "medical", sourceId: "KITA_MEDICAL_INSTITUTIONS_OPEN_DATA" },
    { id: "kita-medical-kominato", name: "医療法人社団リボン会小湊小児科医院", category: "medical", sourceId: "KITA_MEDICAL_INSTITUTIONS_OPEN_DATA" },
    { id: "kita-medical-shikada", name: "しかだこどもクリニック", category: "medical", sourceId: "KITA_MEDICAL_INSTITUTIONS_OPEN_DATA" },
  ],
  "05_子育て施設一覧.csv": [
    { id: "kita-child-akabane-kita", name: "赤羽北児童館", category: "child_support", sourceId: "KITA_CHILDCARE_FACILITIES_OPEN_DATA" },
    { id: "kita-child-kamiya", name: "神谷子どもセンター", category: "child_support", sourceId: "KITA_CHILDCARE_FACILITIES_OPEN_DATA" },
    { id: "kita-child-jujodai", name: "十条台子どもセンター", category: "child_support", sourceId: "KITA_CHILDCARE_FACILITIES_OPEN_DATA" },
  ],
  "01_公共施設一覧.csv": [
    { id: "kita-public-akabane-hall", name: "赤羽会館", category: "public_facility", sourceId: "KITA_PUBLIC_FACILITIES_OPEN_DATA" },
    { id: "kita-public-hokutopia", name: "北とぴあ", category: "public_facility", sourceId: "KITA_PUBLIC_FACILITIES_OPEN_DATA" },
  ],
};
