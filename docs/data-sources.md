# Data Sources

実装に同梱した **Source Registry の metadata を正**とする。本書はデータの読み方・登録ルールであり、未確認の数値、更新日、ライセンスを補完しない。

|区分|Dataset / Provider / URL|用途|利用者 / 行政|更新・取得・制約|
|---|---|---|---|---|
|Official information|出入国在留管理庁 相談窓口 / FRESC|滞在等で確認すべき事項とHuman Handoff|利用者|個別判断には使わない。2026-08-14確認|
|Open data|東京都「外国人人口 令和8年1月」CSV|Preparedness Viewの北区・ミャンマー人口|行政|基準日 2026-01-01。住民基本台帳であり短期滞在者を表さない。CC BY|
|Open data|東京都北区「区立小学校一覧」CSV / [北区オープンデータ](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html)|Local Actionの学校|利用者|CC BY 4.0。取得日・CSV URLはSource Registry/生成cacheを参照。豊川・浮間・十条台・西が丘小学校の限定キャッシュで、就学可否・通学区域・空き・言語支援を示さない|
|Open data|東京都北区「自治体標準オープンデータセット：医療機関一覧」 / [北区オープンデータ](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html)|Local Actionの医療|利用者|CC BY 4.0。標準ODS ZIP内 `10_医療機関一覧.csv` からの小児科3件の限定キャッシュ。受診可否、診療時間、予約、対応言語は要確認|
|Open data|東京都北区「自治体標準オープンデータセット：子育て施設一覧」 / [北区オープンデータ](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html)|Local Actionの子ども施設|利用者|CC BY 4.0。標準ODS ZIP内 `05_子育て施設一覧.csv` からの3件の限定キャッシュ。対象、空き、現在のプログラム、言語対応は要確認|
|Open data|東京都北区「自治体標準オープンデータセット：公共施設一覧」 / [北区オープンデータ](https://www.city.kita.lg.jp/city-information/disclosure/1014461.html)|Local Actionの公共施設|利用者|CC BY 4.0。標準ODS ZIP内 `01_公共施設一覧.csv` からの赤羽会館・北とぴあの限定キャッシュ。図書館公式ページの値は保持しない。利用条件・サービス・言語対応は要確認|
|Demo fixture|架空Persona AとSituation回答|画面・ルール・デモの安定動作|両方|実在人物・個別ケースを表さない|

形式は Raw Open Data → Adapter → Normalizer → bundled cache → Common Schema とする。`pnpm data:fetch` は東京人口CSV、北区小学校CSV（Shift_JIS）、北区標準ODS ZIP（UTF-8 CSV）を取得し、選定名が見つからない場合は失敗する。Runtimeは外部サイトにアクセスしない。Source Registryにはタイトル、提供者、人間向けのカタログURL、機械取得URL、種別、カテゴリ、確認できたライセンス、取得日、注記を持たせる。数値・施設情報・対応範囲の根拠は必ず該当metadataへ遡れるようにする。
