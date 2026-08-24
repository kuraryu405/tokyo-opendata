# Open Data Strategy

## User side: Open Data → Local Action

子どもの年齢、困りごと、自治体から必要なカテゴリを有効化し、正規化済みの学校、医療、子育て、公共施設を表示する。北区の施設は、CC BY 4.0を明示した北区Open Dataから生成したbundled cacheのみを利用する。これは施設検索ではなく、「この地域で生活を続けるために確認できる公共資源」である。学校の表示は就学保証ではない。

各Local ActionカードはSource Registryを通じて、dataset title、publisher、カタログURL、license、取得日を表示する。これはCC BYの表示要件のためであり、施設ページの内容を実行時にスクレイピングするものではない。

## Administration side: Open Data → Preparedness

国籍別住民人口等の参考データと地域資源を組み合わせ、Potential Impact、Existing Resources、Data Gap、対応検討項目を表示する。人口/施設数で不足・優先順位・対応能力を自動判定しない。

## Data Gap

短期滞在者のリアルタイム地域分布、帰国困難者数、窓口の言語・対応能力、リアルタイム相談量・施設余力は、一般に十分なOpen Dataとして利用できない。特に住民人口は短期旅行者を完全に表さない。施設データの住所・電話・座標以外の値は、Open Dataにある場合のみ正規化し、空欄を推測して補完しない。この不確実性をUIと資料で明示する。

## Future feedback loop

将来は、同意・匿名化・集計・最小化を前提に利用傾向を把握し、支援導線と必要なデータ整備を検討する。MVPは利用者の個別行動や位置を収集・追跡しない。
