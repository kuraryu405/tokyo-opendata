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
  landing_page_url,
  landing_page_updated_at,
  catalog_url,
  license,
  license_url,
  terms_url,
  attribution,
  update_frequency,
  coverage_note
) VALUES (
  'KITA_EARTHQUAKE_SHELTERS',
  '避難所一覧（震災対応）',
  '北区',
  'https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/017/500/hinan_shinsai.csv',
  'https://www.city.kita.lg.jp/safety/disaster/1018235/1018236/1017500.html',
  '2026-06-17',
  'https://catalog.data.metro.tokyo.lg.jp/dataset/t131172d0000000005',
  'Creative Commons Attribution 4.0 International (CC BY 4.0)',
  'https://creativecommons.org/licenses/by/4.0/',
  'https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/kiyaku.pdf',
  '避難所一覧（震災対応）, 北区, CC BY 4.0',
  'Irregular publisher updates; checked daily',
  '北区が公開する震災対応避難所の一覧。発災時に必ず施設を開設するわけではない。現在の開設状況は北区防災ポータルで確認する。収容可能人数、対応言語は含まれない。'
)
ON CONFLICT(source_id) DO UPDATE SET
  title = excluded.title,
  publisher = excluded.publisher,
  source_url = excluded.source_url,
  landing_page_url = excluded.landing_page_url,
  landing_page_updated_at = excluded.landing_page_updated_at,
  catalog_url = excluded.catalog_url,
  license = excluded.license,
  license_url = excluded.license_url,
  terms_url = excluded.terms_url,
  attribution = excluded.attribution,
  update_frequency = excluded.update_frequency,
  coverage_note = excluded.coverage_note,
  updated_at = CURRENT_TIMESTAMP;
