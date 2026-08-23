# Data Sources

実装に同梱した **Source Registry の metadata を正**とする。本書はデータの読み方・登録ルールであり、未確認の数値、更新日、ライセンスを補完しない。

|区分|Dataset / Provider / URL|用途|利用者 / 行政|更新・取得・制約|
|---|---|---|---|---|
|Official information|出入国在留管理庁 相談窓口 / FRESC|滞在等で確認すべき事項とHuman Handoff|利用者|個別判断には使わない。2026-08-14確認|
|Open data|東京都「外国人人口 令和8年1月」CSV|Preparedness Viewの北区・ミャンマー人口|行政|基準日 2026-01-01。住民基本台帳であり短期滞在者を表さない。CC BY|
|Open data|東京都北区 / [北区オープンデータ「区立小学校一覧」](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html) / [配布CSV](https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/syougakkou-2.csv)|Local Actionの学校|利用者|[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。2026-08-23取得の4校キャッシュ。就学可否・通学区域・空き・言語支援を示さない|
|Open data|東京都北区 / [北区オープンデータ「自治体標準オープンデータセット」](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html) / [配布ZIP](https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip) 内の医療機関一覧CSV|Local Actionの医療|利用者|[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。2026-08-23取得の3件キャッシュ。診療状況・予約・対応言語は要確認|
|Open data|東京都北区 / [北区オープンデータ「自治体標準オープンデータセット」](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html) / [配布ZIP](https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip) 内の子育て施設一覧CSV|Local Actionの子ども施設|利用者|[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。2026-08-23取得の3件キャッシュ。現在のプログラム・対象・空き・言語対応は要確認|
|Open data|東京都北区 / [北区オープンデータ「自治体標準オープンデータセット」](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html) / [配布ZIP](https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip) 内の公共施設一覧CSV|Local Actionの公共施設|利用者|[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。2026-08-23取得の2件キャッシュ。利用条件・現在のサービス・言語対応は要確認|
|Demo fixture|架空Persona AとSituation回答|画面・ルール・デモの安定動作|両方|実在人物・個別ケースを表さない|
|Voluntary service response|同意済み` situation_submissions `の匿名集計|Crisis Viewの任意回答傾向|行政|Open Dataではない。自治体13117・東京暦の直近7/30/90日・1軸のみ。全体・カテゴリとも5件未満を非表示。会話・個票を使わず、人口・不足・優先度・能力を示さない。|

形式は Raw Open Data → Adapter → Normalizer → Common Schema とする。`pnpm data:fetch` は北区オープンデータの配布CSV/ZIPと東京都の人口CSVを取得して、レビュー可能なJSONキャッシュを生成する。Sourceにはタイトル、提供者、カタログURL、配布URL、種別、カテゴリ、更新日、取得日、ライセンス、注記を持たせる。数値・施設情報・対応範囲の根拠は必ず該当metadataへ遡れるようにする。施設カードの名称・自治体・住所・電話・座標は生成キャッシュから表示し、翻訳カタログには安全上の説明文のみを置く。

Action CardはSource Registryのstable IDだけを保持する。カタログ完全性テストで全source ID、HTTPS URL、提供者、確認日を検証し、実行時に解決できないカードは表示しない。カード別の利用目的と再レビュー期限は [Action Card Catalog](action-card-catalog.md) を参照する。
