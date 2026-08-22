# Data Sources

実装に同梱した **Source Registry の metadata を正**とする。本書はデータの読み方・登録ルールであり、未確認の数値、更新日、ライセンスを補完しない。

|区分|Dataset / Provider / URL|用途|利用者 / 行政|更新・取得・制約|
|---|---|---|---|---|
|Official information|出入国在留管理庁 相談窓口 / FRESC|滞在等で確認すべき事項とHuman Handoff|利用者|個別判断には使わない。2026-08-14確認|
|Open data|東京都「外国人人口 令和8年1月」CSV|Preparedness Viewの北区・ミャンマー人口|行政|基準日 2026-01-01。住民基本台帳であり短期滞在者を表さない。CC BY|
|Official public list|北区立小学校公式ページから4校を選定|Local Actionの学校|利用者|非全件のキュレート済みキャッシュ。就学可否・通学区域・空き・言語支援を示さない|
|Official public list|北区「病院・診療所・歯科診療所名簿」から小児科3件を選定|Local Actionの医療|利用者|2025-05-21版。診療状況・予約・対応言語は要確認|
|Official public list|北区 子どもセンター・児童館一覧から3件を選定|Local Actionの子ども施設|利用者|非全件。現在のプログラム・対象・空き・言語対応は要確認|
|Official public list|北区立図書館一覧から2件を選定|Local Actionの公共施設|利用者|非全件。開館・利用条件・言語対応は要確認|
|Demo fixture|架空Persona AとSituation回答|画面・ルール・デモの安定動作|両方|実在人物・個別ケースを表さない|

形式は Raw Open Data → Adapter → Normalizer → Common Schema とする。Sourceにはタイトル、提供者、URL、種別、カテゴリ、更新日、取得日、確認日、注記を持たせる。数値・施設情報・対応範囲の根拠は必ず該当metadataへ遡れるようにする。

## 人口キャッシュの取得と検証

- `pnpm data:fetch`は東京都のCSVを取得し、北区（地域コード`13117`）・ミャンマーの1レコードだけを`packages/data/src/normalized/kita-myanmar-population.json`へ保存する。
- 必須列、全行の列数、対象行の一意性、自治体名、地域階層、人口の非負整数を確認できない場合は失敗し、既存キャッシュを変更しない。
- `dataUpdatedAt`は統計の基準日、`fetchedAt`は取得日として別々に保持する。取得しただけで内容を人が確認済みとは扱わない。
- 実行後は`git diff -- packages/data/src/normalized/kita-myanmar-population.json`と`pnpm test`で差分と利用側の整合を確認する。
- 学校・医療・子ども施設・図書館の公式ページ／PDFは自動取得せず、原資料を人が確認してからキュレート済みキャッシュを更新する。
