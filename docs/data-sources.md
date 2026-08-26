# Data Sources

実装に同梱した **Source Registry の metadata を正**とする。本書はデータの読み方・登録ルールであり、未確認の数値、更新日、ライセンスを補完しない。

|区分|Dataset / Provider / URL|用途|利用者 / 行政|更新・取得・制約|
|---|---|---|---|---|
|Official information|出入国在留管理庁 相談窓口 / FRESC|滞在等で確認すべき事項とHuman Handoff|利用者|個別判断には使わない。2026-08-14確認|
|Open data|東京都「外国人人口 令和8年1月」CSV|Preparedness Viewの北区・ミャンマー人口|行政|基準日 2026-01-01。住民基本台帳であり短期滞在者を表さない。CC BY|
|Open data|東京都北区 / [北区オープンデータ「区立小学校一覧」](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html) / [配布CSV](https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/syougakkou-2.csv)|Local Actionの学校|利用者|[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。配布物Last-Modified 2024-10-31。現行の機械可読 identity/address 契約に不一致があるため、学校レコードは cache から除外中。`pnpm data:fetch` は source が更新されるまで明示的に失敗し、古い値で cache を上書きしない。公式学校ページは検証参照であり、HTMLから値を再配布しない。|
|Open data|東京都北区 / [北区オープンデータ「自治体標準オープンデータセット」](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html) / [配布ZIP](https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip) 内の医療機関一覧CSV|Local Actionの医療|利用者|[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。配布物Last-Modified 2024-10-31。元 ZIP から一部選定・Common Schemaへ正規化した2026-08-23取得の3件キャッシュ。診療状況・予約・対応言語は要確認|
|Open data|東京都北区 / [北区オープンデータ「自治体標準オープンデータセット」](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html) / [配布ZIP](https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip) 内の子育て施設一覧CSV|Local Actionの子ども施設|利用者|[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。配布物Last-Modified 2024-10-31。元 ZIP から一部選定・Common Schemaへ正規化した2026-08-23取得の3件キャッシュ。現在のプログラム・対象・空き・言語対応は要確認|
|Open data|東京都北区 / [北区オープンデータ「自治体標準オープンデータセット」](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html) / [配布ZIP](https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip) 内の公共施設一覧CSV|Local Actionの公共施設|利用者|[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。配布物Last-Modified 2024-10-31。元 ZIP から一部選定・Common Schemaへ正規化した2026-08-23取得の2件キャッシュ。利用条件・現在のサービス・言語対応は要確認|
|Demo fixture|架空Persona AとSituation回答|画面・ルール・デモの安定動作|両方|実在人物・個別ケースを表さない|
|Voluntary service response|同意済みかつcapability検証済み`accepted`の` situation_submissions `匿名集計|Crisis Viewの任意回答傾向|行政|Open Dataではない。`quarantined`は除外。自治体13117・東京暦の直近7/30/90日・1軸のみ。全体・カテゴリとも5件未満を非表示。会話・個票を使わず、人口・不足・優先度・能力を示さない。|

形式は Raw Open Data → Adapter → Normalizer → Common Schema とする。`pnpm data:fetch` は北区オープンデータの配布CSV/ZIPと東京都の人口CSVを取得して、レビュー可能なJSONキャッシュを生成する。Sourceにはタイトル、提供者、カタログURL、配布URL、種別、カテゴリ、更新日、取得日、ライセンス、ライセンスURL、選定・正規化などの変更メタデータ、注記を持たせる。取得日は配布物を取得した日であり、内容を人手確認した日（`verifiedAt`）ではない。数値・施設情報・対応範囲の根拠は必ず該当metadataへ遡れるようにする。施設カードの名称・自治体・住所・電話・座標は生成キャッシュから表示し、翻訳カタログには安全上の説明文のみを置く。

Action CardはSource Registryのstable IDだけを保持する。カタログ完全性テストで全source ID、HTTPS URL、提供者、取得日を検証し、実行時に解決できないカードは表示しない。カード別の利用目的と再レビュー期限は [Action Card Catalog](action-card-catalog.md) を参照する。

## 北区施設Open Dataコネクタ

- Source ID: `KITA_ELEMENTARY_SCHOOLS_OPEN_DATA`、`KITA_MEDICAL_INSTITUTIONS_OPEN_DATA`、`KITA_CHILDCARE_FACILITIES_OPEN_DATA`、`KITA_PUBLIC_FACILITIES_OPEN_DATA`
- 利用目的: 既存Local Actionの学校・医療・子育て・公共施設
- 固定取得先: `syougakkou-2.csv` と `hyo-jyun.zip`（上表の配布URL）
- 北区利用規約: `https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/kiyaku.pdf`
- ライセンス: CC BY 4.0。Source Registryの各source attributionを表示に使う
- 公開元の更新頻度: 随時。StayBridgeは認証付き手動syncで確認する

コネクタは上記2 URLへのGETだけを許可し、query、redirect、異なるhost/path、異なるmethodを拒否する。CSV 1 MiB、ZIP 8 MiB、各request 30秒、Content-Type、HTTP status、ZIP境界・展開後総量・CRC32、CSV quoting・列数・field 1 KiBをfail-closedで検証する。既存selectionの12 identityが各1件そろうことを完全性条件とし、current-schoolの名称・現行住所checkも再利用する。1件でも欠落・重複・driftがあればD1へstageせず、active datasetを切り替えない。

検証後は既存の `school`、`medical`、`child_support`、`public_facility` Common Schemaへ正規化する。raw CSV/ZIP、未知field、説明・命令文、元データにない空き・受入可否・対応言語をD1へ保存しない。現在の公式school CSVはidentity/address contractに不一致があるため、手動syncは失敗し、既存activeまたは同梱8件cacheを維持する。公式CSVが現行contractを満たした場合だけ12件版をactive化する。
