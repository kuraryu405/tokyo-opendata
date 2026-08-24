# Open Data Strategy

## User side: Open Data → Local Action

子どもの年齢、困りごと、自治体から必要なカテゴリを有効化し、source-backedで正規化済みの医療、子育て、公共施設を表示する。学校は現行の機械可読 source が公式の current identity/address 契約を満たすまで表示しない。これは施設検索ではなく、「この地域で生活を続けるために確認できる公共資源」である。学校の表示は就学保証ではない。

北区の施設カードは、北区オープンデータの配布CSV/ZIPから一部レコードを選定し、Common Schemaへ正規化して再生成する。これらのデータセットはCC BY 4.0で提供されている。アプリは配布元に実行時アクセスせず、`pnpm data:fetch` で生成・レビューしたキャッシュを同梱する。元データを無変更ミラーとして見せないため、カードには「一部選定・正規化」のlocale別表示と、カタログ出典、提供者、ライセンス、ライセンスURL、取得日を表示する。取得日は人手による内容確認日ではない。名称・住所・電話・座標を翻訳テキストや公式HTMLから補完しない。

### Currentness gate

学校CSVに廃校・統合前の名称や旧住所が残っている場合、`pnpm data:fetch` は current identity/address 契約違反として cache 書き込み前に失敗する。現在のコミット済み cache には学校カテゴリを含めない。検証アンカーは北区の[十条小学校ページ](https://www.city.kita.lg.jp/education/elementary/jujo/about/2001282.html)と[西が丘小学校ページ](https://www.city.kita.lg.jp/education/elementary/nishigaoka/about/2002206.html)だが、これらの公式HTMLの値をOpen Dataとして再配布する source にはしない。選定行の消失、名称変更、住所不一致はいずれも fail-closed とする。

## Administration side: Open Data → Preparedness

国籍別住民人口等の参考データと地域資源を組み合わせ、Potential Impact、Existing Resources、Data Gap、対応検討項目を表示する。人口/施設数で不足・優先順位・対応能力を自動判定しない。

## Data Gap

短期滞在者のリアルタイム地域分布、帰国困難者数、窓口の言語・対応能力、リアルタイム相談量・施設余力は、一般に十分なOpen Dataとして利用できない。特に住民人口は短期旅行者を完全に表さない。この不確実性をUIと資料で明示する。

## Future feedback loop

Situation Checkは、別同意のもとで自治体コード、選択式ニーズ、粗い時間・年齢区分だけをD1へ保存できる。これは公開データではない。Crisis Viewでは自治体Workerの固定routeが` situation_submissions `のみを、自治体13117・東京暦の7/30/90日・単一allowlist軸で集計する。全体・カテゴリはk=5以上のみを返し、個票、国籍、正確な時刻・住所、自由記述をCrisis Viewへ渡さない。

LLM会話はSituation回答と別同意・別テーブルに保存し、Open DataやCrisis Viewの入力にしない。会話本文を公開一覧化せず、サービスの運用・安全確認だけに用い、学習や支援ニーズ集計へ二次利用しない。いずれも恒久ユーザーIDやCookie横断追跡を持たず、マスキング済みデータを無期限保持し、削除コード保有者による削除を可能にする。この無期限保持方針は、従来想定していた保持期限後の自動削除条件を置き換える。
