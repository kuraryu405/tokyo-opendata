/** Stable source fields shared by the fetch pipeline and UI registry. */
export const TOKYO_FOREIGN_POPULATION_SOURCE = {
  id: "TOKYO_FOREIGN_POPULATION_2026_01",
  url: "https://www.toukei.metro.tokyo.lg.jp/gaikoku/2026/ga26ev0300.csv",
  dataUpdatedAt: "2026-01-01",
} as const;

/** The only remote resource accepted by the first shelter connector. */
export const KITA_EARTHQUAKE_SHELTER_SOURCE = {
  id: "KITA_EARTHQUAKE_SHELTERS",
  title: "避難所一覧（震災対応）",
  publisher: "北区",
  url: "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/017/500/hinan_shinsai.csv",
  landingPageUrl: "https://www.city.kita.lg.jp/safety/disaster/1018235/1018236/1017500.html",
  landingPageUpdatedAt: "2026-06-17",
  catalogUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t131172d0000000005",
  termsUrl: "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/kiyaku.pdf",
  license: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "避難所一覧（震災対応）, 北区, CC BY 4.0",
  updateFrequency: "Irregular publisher updates; checked daily",
  dataUpdatedAt: "2025-09-01",
  coverageNote: "北区が公開する震災対応避難所の一覧。発災時に必ず施設を開設するわけではない。現在の開設状況は北区防災ポータルで確認する。収容可能人数、対応言語は含まれない。",
} as const;
