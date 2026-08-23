# Action Card Catalog

「あなたの次のステップ」に表示するカードは、生成文ではなく、型付き静的カタログを正本とする。カードの内容・出典・CTA・公開可否は `packages/domain/src/action-catalog.ts`、公開対象localeの注意事項は `packages/i18n/src/action-notices.ts`、title / description / CTA はlocale catalogで管理する。回答からカードを選ぶルールは `packages/domain/src/rules.ts` に分離する。

## Production inventory

|Action ID|Purpose|Timing|Destination|Source IDs|Risk|Review after|
|---|---|---|---|---|---|---|
|`CHECK_STAY_STATUS`|現在の滞在と確認すべき手続を公式窓口へつなぐ|TODAY|Human Support|`ISA`|high|2026-11-23|
|`CONTACT_OFFICIAL_SUPPORT`|個別確認が必要な状況を人へ引き継ぐ|THIS WEEK|Human Support|`FRESC`|high|2026-11-23|
|`CHECK_CHILD_EDUCATION`|就学可否を断定せず教育の確認先を示す|THIS WEEK|Local / school|`KITA_ELEMENTARY_SCHOOLS_OPEN_DATA`|high|2026-11-23|
|`PLAN_TEMPORARY_LIVING`|宿泊終了前に生活・滞在先の相談を促す|THIS WEEK|Human Support|`TOKYO_CONSULTATION`|high|2026-11-23|
|`CHECK_MEDICAL_OPTIONS`|必要時に確認できる公式医療一覧を示す|NEXT 30 DAYS|Local / medical|`KITA_MEDICAL_INSTITUTIONS_OPEN_DATA`|standard|2027-02-23|
|`CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH`|求職前に就労可否の公式確認を促す|NEXT 30 DAYS|Human Support|`ISA`, `FRESC`|high|2026-11-23|
|`FIND_LANGUAGE_SUPPORT`|相談前に言語支援の確認を促す|THIS WEEK|Human Support|`TOKYO_CONSULTATION`|standard|2027-02-23|
|`CHECK_BEFORE_STAY_DEADLINE`|入力期限より前の書類・公式確認を促す|BEFORE DEADLINE|Human Support|`ISA`|high|2026-11-23|
|`CHECK_CHILD_LOCAL_SUPPORT`|子どもの日常生活に役立つ公共施設を示す|NEXT 30 DAYS|Local / child support|`KITA_CHILDCARE_FACILITIES_OPEN_DATA`, `KITA_PUBLIC_FACILITIES_OPEN_DATA`|standard|2027-02-23|
|`CHECK_LIVING_COST_SUPPORT`|当面の生活費に関する公式相談へつなぐ|THIS WEEK|Human Support|`FRESC`, `TOKYO_CONSULTATION`|high|2026-11-23|

## Publication gates

- 安定したAction ID、目的、category、timing、fallback copy、注意事項、source ID、CTA destination、risk、review metadataを必須とする。
- `review.status=reviewed` かつ `reviewAfter` 以前のカードだけをRule Engineが返す。期限切れカードは表示しない。
- high riskカードは `humanReviewRequired=true` を必須とする。
- source IDは1件以上必要とし、重複を禁止する。利用者アプリのintegration testで全IDがSource Registryへ解決できることを確認する。
- 実行時にもsource IDが解決できないカードを除外する。表示可能カードがない場合は、推測せず公式相談先へのfallbackを表示する。
- title / description / CTAは全locale catalogに必要とする。公開中の `ja` / `en` / `my` にはカード固有の注意事項を必須とする。
- 専門家翻訳は現時点で実施できないためIssue #7はclose済み。`expertReview` は未完了のまま保持し、専門レビュー済みとは扱わない。

## Review operation

- high risk: 3か月以内に再確認する。
- standard: 6か月以内に再確認する。
- 内容、出典、CTA、リスク区分のいずれかを変更した場合は `reviewedAt`、`reviewedBy`、`reviewAfter` を同じ変更で更新する。
- 公式ページのURL、提供者、取得・確認日はSource Registryを正とする。2026-08-23時点で本カタログが参照する公式URLのHTTP到達性を確認済み。
- 選択ルールの追加・変更は本台帳へ混ぜず、Rule Engine側で扱う。
