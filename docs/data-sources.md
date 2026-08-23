# Data Sources

## Assistant source contract

assistantはKita / `emergency_shelter` 固定allowlistのactive normalized resourcesだけを取得する。応答の各source cardは公式landing page、`dataUpdatedAt`、`fetchedAt`、coverage noteを示す。`fetchedAt` がserver時刻から48時間を超える（または5分超の未来・無効）cacheは利用せず、AIと施設列挙を停止して公式/人へのhandoffだけを返す。`dataUpdatedAt` はcache ageと混同せず開示する。D1障害または不正metadata時は検証済みbundleへ切り替え、出典のない主張を返さない。

実装に同梱した **Source Registry の metadata を正**とする。本書はデータの読み方・登録ルールであり、未確認の数値、更新日、ライセンスを補完しない。

|区分|Dataset / Provider / URL|用途|利用者 / 行政|更新・取得・制約|
|---|---|---|---|---|
|Official information|出入国在留管理庁 相談窓口 / FRESC|滞在等で確認すべき事項とHuman Handoff|利用者|個別判断には使わない。2026-08-14確認|
|Open data|東京都「外国人人口 令和8年1月」CSV|Preparedness Viewの北区・ミャンマー人口|行政|基準日 2026-01-01。住民基本台帳であり短期滞在者を表さない。CC BY|
|Open data|北区「避難所一覧（震災対応）」CSV / [東京都カタログ](https://catalog.data.metro.tokyo.lg.jp/dataset/t131172d0000000005)|公開APIの北区・震災対応避難所|両方|公式ページ更新日 2026-06-17、CSVのHTTP最終更新日 2025-09-01、取得日 2026-08-23。56件。開設、空き、収容人数、対応言語を示さない。CC BY 4.0|
|Official public list|北区立小学校公式ページから4校を選定|Local Actionの学校|利用者|非全件のキュレート済みキャッシュ。就学可否・通学区域・空き・言語支援を示さない|
|Official public list|北区「病院・診療所・歯科診療所名簿」から小児科3件を選定|Local Actionの医療|利用者|2025-05-21版。診療状況・予約・対応言語は要確認|
|Official public list|北区 子どもセンター・児童館一覧から3件を選定|Local Actionの子ども施設|利用者|非全件。現在のプログラム・対象・空き・言語対応は要確認|
|Official public list|北区立図書館一覧から2件を選定|Local Actionの公共施設|利用者|非全件。開館・利用条件・言語対応は要確認|
|Demo fixture|架空Persona AとSituation回答|画面・ルール・デモの安定動作|両方|実在人物・個別ケースを表さない|
|Voluntary service response|同意済み` situation_submissions `の匿名集計|Crisis Viewの任意回答傾向|行政|Open Dataではない。自治体13117・東京暦の直近7/30/90日・1軸のみ。全体・カテゴリとも5件未満を非表示。会話・個票を使わず、人口・不足・優先度・能力を示さない。|

形式は Raw Open Data → Adapter → Normalizer → Common Schema とする。Sourceにはタイトル、提供者、URL、種別、カテゴリ、更新日、取得日、確認日、注記を持たせる。数値・施設情報・対応範囲の根拠は必ず該当metadataへ遡れるようにする。

## 人口キャッシュの取得と検証

- `pnpm data:fetch`は東京都のCSVを取得し、北区（地域コード`13117`）・ミャンマーの1レコードだけを`packages/data/src/normalized/kita-myanmar-population.json`へ保存する。
- 必須列、全行の列数、対象行の一意性、自治体名、地域階層、人口の非負整数を確認できない場合は失敗し、既存キャッシュを変更しない。
- `dataUpdatedAt`は統計の基準日、`fetchedAt`は取得日として別々に保持する。取得しただけで内容を人が確認済みとは扱わない。
- 実行後は`git diff -- packages/data/src/normalized/kita-myanmar-population.json`と`pnpm test`で差分と利用側の整合を確認する。
- 学校・医療・子ども施設・図書館の公式ページ／PDFは自動取得せず、原資料を人が確認してからキュレート済みキャッシュを更新する。

## 北区・震災対応避難所コネクタ

- Source ID: `KITA_EARTHQUAKE_SHELTERS`
- 公式ページ: `https://www.city.kita.lg.jp/safety/disaster/1018235/1018236/1017500.html`（更新日 2026-06-17）
- 固定取得先: `https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/017/500/hinan_shinsai.csv`
- カタログ: `https://catalog.data.metro.tokyo.lg.jp/dataset/t131172d0000000005`
- ライセンス: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- 北区利用規約: `https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/kiyaku.pdf`
- 表示: `避難所一覧（震災対応）, 北区, CC BY 4.0`
- 公開元の更新頻度: 随時。StayBridgeは日次で変更を確認する。

コネクタは上記URLへのGETだけを許可し、クエリ、redirect、異なるhost/pathを拒否する。`text/csv`、1 MiB以下、30秒以内、50〜200行、各field 1 KiB以下であることに加え、必須headerの順序、全行の列数、カテゴリ、東京都、北区住所、北区周辺の許容範囲（緯度35.70〜35.85、経度139.65〜139.85）内の有限座標、名称・位置の重複を検証する。50行の下限は現在の公式56件を厳密固定せず、途中切断や部分応答をactive化しないための保守的な完全性floorである。公開値は`emergency_shelter`へ正規化し、元CSVにない開設状況、空き、収容人数、対応言語は補完しない。raw CSVはD1に保存しない。

北区の公式案内では、避難所は自宅に被害があり生活できない場合の避難生活場所であり、発災時に必ず開設されるとは限らない。APIの施設一覧を現在の開設・利用可能性として扱わず、[北区防災ポータル](https://bosaiportal.city.kita.lg.jp/)で最新の開設情報を確認する。
