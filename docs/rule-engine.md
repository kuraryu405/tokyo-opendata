# Rule Engine

ルールは決定論的で、同じ Situation と評価日（`asOfDate`）なら同じ Action を返す。LLMは判断に介入しない。ルールはカード本文・出典・CTAを保持せず、`packages/domain/src/action-catalog.ts` のうちレビュー済みで期限内のカードだけを参照する。

|Rule ID|入力・条件|Action / 理由|Risk / Source requirement|
|---|---|---|---|
|R-STAY-01|旅行/知人訪問かつ帰国が難しい|TODAY: 滞在期間を公式に確認。短期滞在予定のため|延長・資格変更を断定しない。公式相談先が必要|
|R-CONSULT-01|帰国困難または期限不明|THIS WEEK: 専門相談窓口へ。個別確認が必要|法律助言ではない。公的Sourceが必要|
|R-DEADLINE-01|期限日を入力済み、評価日以降|BEFORE DEADLINE: 書類と公式手続を確認|期限・結果を予測しない|
|R-DEADLINE-02|期限日を入力済み、評価日より前|TODAY: 期限前Actionを出さず、公式窓口への即時相談を案内|資格・手続結果を断定しない。公式相談先が必要|
|R-HOUSING-01|ホテル/不安定な宿泊かつ帰国困難|THIS WEEK: 当面の滞在先を相談|住宅を推薦・確保と断定しない|
|R-EDU-01|6–11歳の子がいる|THIS WEEK: 教育相談、schoolをLocal Actionで有効化|入学可否は自治体・学校に確認|
|R-MED-01|medical needs|NEXT 30 DAYS: 医療を確認、medicalを有効化|診療内容・利用可否を推測しない|
|R-CHILD-01|子どもがいる|NEXT 30 DAYS: 子育て・公共資源を表示|対象条件は施設へ確認|
|R-WORK-01|employment/living cost needs|NEXT 30 DAYS: 就労前に現在の滞在状況で就労可能か確認|求人直接誘導は禁止。公式確認が必要|

各Actionには `reasonCode` と動的priorityを付加する。title、description、source IDs、注意事項、human review、CTA destination、review metadataは静的カタログを正とし、理由をUIで表示する。カタログ運用は [Action Card Catalog](action-card-catalog.md) を参照する。
