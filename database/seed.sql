INSERT INTO backend_metadata (key, value)
VALUES ('seed_version', '2')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP
WHERE backend_metadata.value <> excluded.value;

INSERT INTO open_data_sources (
  source_id,
  title,
  publisher,
  source_url,
  catalog_url,
  license,
  license_url,
  terms_url,
  attribution,
  update_frequency,
  coverage_note,
  data_updated_at,
  fetched_at
) VALUES (
  'KITA_ELEMENTARY_SCHOOLS_OPEN_DATA', '区立小学校一覧', '東京都北区',
  'https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/syougakkou-2.csv',
  'https://www.city.kita.lg.jp/city-information/disclosure/1014461.html',
  'Creative Commons Attribution 4.0 International (CC BY 4.0)',
  'https://creativecommons.org/licenses/by/4.0/',
  'https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/kiyaku.pdf',
  '区立小学校一覧, 東京都北区, CC BY 4.0',
  'Irregular publisher updates; checked by manual sync',
  'StayBridgeが既存Local Action用に選定した施設のみ。全施設、空き、受入可否、対応言語、現在のサービス状況を表さない。',
  '2024-10-31', '2026-08-23'
), (
  'KITA_MEDICAL_INSTITUTIONS_OPEN_DATA', '自治体標準オープンデータセット：医療機関一覧', '東京都北区',
  'https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip',
  'https://www.city.kita.lg.jp/city-information/disclosure/1014461.html',
  'Creative Commons Attribution 4.0 International (CC BY 4.0)',
  'https://creativecommons.org/licenses/by/4.0/',
  'https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/kiyaku.pdf',
  '自治体標準オープンデータセット：医療機関一覧, 東京都北区, CC BY 4.0',
  'Irregular publisher updates; checked by manual sync',
  'StayBridgeが既存Local Action用に選定した施設のみ。全施設、空き、受入可否、対応言語、現在のサービス状況を表さない。',
  '2024-10-31', '2026-08-23'
), (
  'KITA_CHILDCARE_FACILITIES_OPEN_DATA', '自治体標準オープンデータセット：子育て施設一覧', '東京都北区',
  'https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip',
  'https://www.city.kita.lg.jp/city-information/disclosure/1014461.html',
  'Creative Commons Attribution 4.0 International (CC BY 4.0)',
  'https://creativecommons.org/licenses/by/4.0/',
  'https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/kiyaku.pdf',
  '自治体標準オープンデータセット：子育て施設一覧, 東京都北区, CC BY 4.0',
  'Irregular publisher updates; checked by manual sync',
  'StayBridgeが既存Local Action用に選定した施設のみ。全施設、空き、受入可否、対応言語、現在のサービス状況を表さない。',
  '2024-10-31', '2026-08-23'
), (
  'KITA_PUBLIC_FACILITIES_OPEN_DATA', '自治体標準オープンデータセット：公共施設一覧', '東京都北区',
  'https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip',
  'https://www.city.kita.lg.jp/city-information/disclosure/1014461.html',
  'Creative Commons Attribution 4.0 International (CC BY 4.0)',
  'https://creativecommons.org/licenses/by/4.0/',
  'https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/kiyaku.pdf',
  '自治体標準オープンデータセット：公共施設一覧, 東京都北区, CC BY 4.0',
  'Irregular publisher updates; checked by manual sync',
  'StayBridgeが既存Local Action用に選定した施設のみ。全施設、空き、受入可否、対応言語、現在のサービス状況を表さない。',
  '2024-10-31', '2026-08-23'
)
ON CONFLICT(source_id) DO UPDATE SET
  title = excluded.title,
  publisher = excluded.publisher,
  source_url = excluded.source_url,
  catalog_url = excluded.catalog_url,
  license = excluded.license,
  license_url = excluded.license_url,
  terms_url = excluded.terms_url,
  attribution = excluded.attribution,
  update_frequency = excluded.update_frequency,
  coverage_note = excluded.coverage_note,
  data_updated_at = MAX(open_data_sources.data_updated_at, excluded.data_updated_at),
  fetched_at = MAX(open_data_sources.fetched_at, excluded.fetched_at),
  updated_at = CURRENT_TIMESTAMP;
