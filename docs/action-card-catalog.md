# Action Card Catalog

「あなたの次のステップ」に表示するカードは、生成文ではなく、型付き静的カタログを正本とする。カードの内容・出典・CTA・公開可否は `packages/domain/src/action-catalog.ts`、公開対象localeの注意事項は `packages/i18n/src/action-notices.ts`、title / description / CTA はlocale catalogで管理する。回答からカードを選ぶルールは `packages/domain/src/rules.ts` に分離する。

## Production inventory

この表は人間向けの監査台帳であり、実装の正本は `actionCatalog` です。Action ID / source IDs / destination / risk / notice / review metadata は `packages/domain/tests/action-catalog-docs.test.ts` で実装と機械的に照合します。Destinationは `help` または `local:<filter>` として `actionCatalog.destination` をそのまま表現します。

|Action ID|Purpose|Timing|Destination|Source IDs|Risk|Notice|Review status|Reviewed at|Reviewed by|Review after|
|---|---|---|---|---|---|---|---|---|---|---|
|`CHECK_STAY_STATUS`|現在の滞在と確認すべき手続を公式窓口へつなぐ|today|`help`|`ISA`, `TOKYO_FRESC_STATUS_CONSULT`|high|Available procedures depend on your individual status. Confirm them with an official support service.|reviewed|2026-08-23|StayBridge maintainers|2026-11-23|
|`CONTACT_OFFICIAL_SUPPORT`|個別確認が必要な状況を人へ引き継ぐ|this_week|`help`|`FRESC`, `TMC_NAVI`, `TOKYO_FRAC`, `TIPS_CONSULTATIONS`, `TMG_CONSULTATION_KURASHI`|high|Services, languages, hours, and contact arrangements can change. Confirm them on the official page.|reviewed|2026-08-23|StayBridge maintainers|2026-11-23|
|`CHECK_CHILD_EDUCATION`|就学可否を断定せず教育の確認先を示す|this_week|`local:school`|`KITA_ELEMENTARY_SCHOOLS_OPEN_DATA`|high|A school listing does not confirm enrolment, catchment, vacancy, or language support. Ask the municipality or school.|reviewed|2026-08-23|StayBridge maintainers|2026-11-23|
|`CHECK_CHILD_EDUCATION_GUIDANCE`|就学手続きの公式案内を確認する|this_week|`help`|`TOKYO_SCHOOL_ENROLL_EN`, `TOKYO_SCHOOL_ATTENDANCE_BOE`, `MEXT_SCHOOL`, `TIPS_SCHOOL`|high|StayBridge does not decide whether your child may enroll. Confirm eligibility, catchment, vacancy, and language support with the municipality or school.|reviewed|2026-08-23|StayBridge maintainers|2026-11-23|
|`FIND_NEARBY_SCHOOLS`|自治体のオープンデータで近くの学校を示す|next_30_days|`local:school`|`KITA_ELEMENTARY_SCHOOLS_OPEN_DATA`|high|A school listing does not confirm enrolment, catchment, vacancy, Japanese language support, or acceptance. Ask the municipality or school.|reviewed|2026-08-23|StayBridge maintainers|2026-11-23|
|`PLAN_TEMPORARY_LIVING`|宿泊終了前に生活・滞在先の相談を促す|this_week|`help`|`TOKYO_CONSULTATION`, `TOKYO_HOUSING_SUPPORT`|high|StayBridge does not confirm accommodation availability or eligibility. Ask a support service about current options.|reviewed|2026-08-23|StayBridge maintainers|2026-11-23|
|`CHECK_MEDICAL_OPTIONS`|必要時に確認できる公式医療一覧を示す|next_30_days|`local:medical`|`KITA_MEDICAL_INSTITUTIONS_OPEN_DATA`|standard|A listing does not confirm current hours, treatment, acceptance, cost, or language support. Contact the institution before visiting.|reviewed|2026-08-23|StayBridge maintainers|2027-02-23|
|`CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH`|求職前に就労可否の公式確認を促す|next_30_days|`help`|`ISA`, `FRESC`, `TOKYO_LABOR_CONSULT`, `TOKYO_FOREIGN_WORKERS_HANDBOOK`, `TOKYO_CAREER_CONSULT`, `HELLO_WORK_TOKYO_FOREIGNER`|high|StayBridge does not decide whether you may work. Confirm your individual status with an official service before acting.|reviewed|2026-08-23|StayBridge maintainers|2026-11-23|
|`FIND_LANGUAGE_SUPPORT`|相談前に言語支援の確認を促す|this_week|`help`|`TOKYO_CONSULTATION`, `TIPS_JAPANESE`|standard|Available languages, interpretation methods, and hours vary. Confirm them with the service before contacting it.|reviewed|2026-08-23|StayBridge maintainers|2027-02-23|
|`CHECK_BEFORE_STAY_DEADLINE`|入力期限より前の書類・公式確認を促す|before_deadline|`help`|`ISA`, `TOKYO_FRESC_STATUS_CONSULT`|high|StayBridge does not calculate, validate, or extend a stay deadline. Confirm the date and procedure with an official service.|reviewed|2026-08-23|StayBridge maintainers|2026-11-23|
|`CHECK_CHILD_LOCAL_SUPPORT`|子どもの日常生活に役立つ公共施設を示す|next_30_days|`local:child_support`|`KITA_CHILDCARE_FACILITIES_OPEN_DATA`, `KITA_PUBLIC_FACILITIES_OPEN_DATA`|standard|Listings do not confirm eligibility, capacity, current programmes, or language support. Confirm details with each facility.|reviewed|2026-08-23|StayBridge maintainers|2027-02-23|
|`CHECK_LIVING_COST_SUPPORT`|当面の生活費に関する公式相談へつなぐ|this_week|`help`|`FRESC`, `TOKYO_CONSULTATION`, `TOKYO_HOUSING_SUPPORT`|high|Available support and eligibility depend on individual circumstances. Confirm them with an official support service.|reviewed|2026-08-23|StayBridge maintainers|2026-11-23|
|`FIND_DAILY_LIFE_GUIDANCE`|日々の生活の悩みを公式の生活ガイド・手続案内へつなぐ|this_week|`help`|`TIPS_LIVING_GUIDE`, `TIPS_PROCEDURES`, `TIPS_LIFE_GUIDE_JP`, `KEISHICHO_FOREIGN_RESIDENT_MANUAL`|standard|Official guides describe general procedures. Rules and required documents depend on your individual situation, so confirm them with a support service.|reviewed|2026-08-23|StayBridge maintainers|2027-02-23|

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
- source追加・削除時は、公式sourceを確認した担当を `reviewedBy`、その確認日を `reviewedAt` に記録し、riskに応じた次回確認日を `reviewAfter` に設定する。Production inventoryを実装と同じPRで更新し、差分testで一致を確認する。
- 公式ページのURL、提供者、取得日はSource Registryを正とする。取得日は配布物の取得日であり、内容を人手で確認した日を意味しない。レビュー時点はAction Card側の`reviewedAt` / `reviewAfter`を使う。2026-08-23時点で本カタログが参照する公式URLのHTTP到達性を確認済み。
- 選択ルールの追加・変更は本台帳へ混ぜず、Rule Engine側で扱う。
