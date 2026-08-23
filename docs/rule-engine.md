# Rule Engine

ルールは `packages/domain/src/rules.ts` の型付き固定表を正とする。同じ `Situation`、`stayAnswer`、評価日 `asOfDate` なら同じAction ID、順序、理由、Rule IDを返す。表示ラベル、LLM、外部API、D1、実行時時計は判断に介入しない。カード本文・注意事項・CTA・出典は `packages/domain/src/action-catalog.ts` のレビュー済み静的カードだけを参照する。

## Resolution contract

- `asOfDate` はサーバーのリクエスト境界から `YYYY-MM-DD` の東京日付として必須注入する。不正値は評価エラーとし、利用者端末の時計は参照しない。
- 同じAction IDへ複数ルールが一致したら、priority降順、同点はRule ID昇順で勝者を決め、1枚だけ返す。
- timing、priority、reason code、画面に出す回答コードはすべて勝者から採用する。子の年齢は集約ラベルへ置換せず、採用した入力コードを表示する。一致したRule ID全件も監査用に保持する。
- 最終一覧はpriority降順、同点はAction ID昇順とする。
- 各ルールのSource requirementは `catalog_sources_required`。Source Registryで全Source IDを解決できないカードはUIで除外する。
- safetyは `check_only`（公式確認のみ）、`consult_only`（人への相談のみ）、`resource_listing_only`（一覧であり利用可否を断定しない）のいずれか。

## Production rule table

|Rule ID|入力コード・条件|除外|Action ID|Timing / Priority|Reason code|Safety|
|---|---|---|---|---|---|---|
|`R-STAY-DEADLINE-PAST`|`stayAnswer=known`, deadline `< asOfDate`|欠損・不正日付|`CHECK_STAY_STATUS`|TODAY / 110|`STAY_DEADLINE_PASSED`|check|
|`R-CONSULT-DEADLINE-PAST`|同上|欠損・不正日付|`CONTACT_OFFICIAL_SUPPORT`|TODAY / 105|`STAY_DEADLINE_PASSED`|consult|
|`R-STAY-DEADLINE-TODAY`|`stayAnswer=known`, deadline `= asOfDate`|欠損・不正日付|`CHECK_STAY_STATUS`|TODAY / 108|`KNOWN_STAY_DEADLINE`|check|
|`R-CONSULT-DEADLINE-TODAY`|同上|欠損・不正日付|`CONTACT_OFFICIAL_SUPPORT`|TODAY / 103|`KNOWN_STAY_DEADLINE`|consult|
|`R-STAY-DEADLINE-FUTURE`|`stayAnswer=known`, deadline `> asOfDate`|欠損・不正日付|`CHECK_BEFORE_STAY_DEADLINE`|BEFORE DEADLINE / 88|`KNOWN_STAY_DEADLINE`|check|
|`R-STAY-RETURN-DIFFICULT-SHORT-NEAR`|`returnStatus=difficult`, purpose=`tourism`/`visiting_family_or_friends`, departure=`within_7_days`/`within_30_days`|その他|`CHECK_STAY_STATUS`|TODAY / 100|`RETURN_DIFFICULT_SHORT_TERM`|check|
|`R-STAY-RETURN-DIFFICULT-SHORT-LATER`|同じ帰国・目的、departure=`within_3_months`/`no_departure_plan`/`unknown`|30日以内|`CHECK_STAY_STATUS`|TODAY / 90|`RETURN_DIFFICULT_SHORT_TERM`|check|
|`R-STAY-RETURN-DIFFICULT-OTHER`|`returnStatus=difficult`, purpose=`work`/`study`/`resident`/`other`/`unknown`|短期目的|`CHECK_STAY_STATUS`|TODAY / 85|`RETURN_DIFFICULT`|check|
|`R-CONSULT-RETURN-DIFFICULT-SHORT`|`returnStatus=difficult`, 短期目的|その他目的|`CONTACT_OFFICIAL_SUPPORT`|THIS WEEK / 95|`RETURN_DIFFICULT_SHORT_TERM`|consult|
|`R-CONSULT-RETURN-DIFFICULT-OTHER`|`returnStatus=difficult`, 非短期目的|短期目的|`CONTACT_OFFICIAL_SUPPORT`|THIS WEEK / 82|`RETURN_DIFFICULT`|consult|
|`R-CONSULT-RETURN-UNKNOWN`|`returnStatus=unknown`|possible/difficult|`CONTACT_OFFICIAL_SUPPORT`|THIS WEEK / 80|`SITUATION_NEEDS_CONFIRMATION`|consult|
|`R-CONSULT-STAY-UNKNOWN`|`stayAnswer=unknown`|known/documents|`CONTACT_OFFICIAL_SUPPORT`|THIS WEEK / 84|`SITUATION_NEEDS_CONFIRMATION`|consult|
|`R-CONSULT-STAY-DOCUMENTS`|`stayAnswer=documents`|known/unknown|`CONTACT_OFFICIAL_SUPPORT`|THIS WEEK / 86|`SITUATION_NEEDS_CONFIRMATION`|consult|
|`R-STAY-NEED`|`needs=stay`|なし|`CHECK_STAY_STATUS`|TODAY / 76|`SITUATION_NEEDS_CONFIRMATION`|check|
|`R-CONSULT-NEED`|`needs=consultation`|なし|`CONTACT_OFFICIAL_SUPPORT`|THIS WEEK / 80|`SITUATION_NEEDS_CONFIRMATION`|consult|
|`R-HOUSING-UNSTABLE`|`returnStatus=difficult`, `accommodation=unstable`|その他宿泊|`PLAN_TEMPORARY_LIVING`|THIS WEEK / 90|`UNSTABLE_ACCOMMODATION`|consult|
|`R-HOUSING-HOTEL`|`returnStatus=difficult`, `accommodation=hotel`|その他宿泊|`PLAN_TEMPORARY_LIVING`|THIS WEEK / 85|`TEMPORARY_HOTEL`|consult|
|`R-HOUSING-NEED`|`needs=accommodation`|なし|`PLAN_TEMPORARY_LIVING`|THIS WEEK / 80|`SITUATION_NEEDS_CONFIRMATION`|consult|
|`R-EDUCATION-SCHOOL-AGE-RETURN`|`returnStatus=difficult`, childAge=`6-11`/`12-14`/`15-17`|学齢児なし|`CHECK_CHILD_EDUCATION`|THIS WEEK / 75|`SCHOOL_AGE_CHILD`|resource|
|`R-EDUCATION-NEED`|`needs=education`, 学齢児あり|学齢児なし|`CHECK_CHILD_EDUCATION`|THIS WEEK / 76|`SCHOOL_AGE_CHILD`|resource|
|`R-CHILD-SCHOOL-AGE-RETURN`|`returnStatus=difficult`, 学齢児あり|学齢児なし|`CHECK_CHILD_LOCAL_SUPPORT`|NEXT 30 DAYS / 68|`CHILD_LOCAL_ROUTINE`|resource|
|`R-CHILDCARE-NEED`|`needs=childcare`, childAge=`0-2`〜`15-17`|子なし・`18+`のみ|`CHECK_CHILD_LOCAL_SUPPORT`|NEXT 30 DAYS / 72|`CHILDCARE_NEED`|resource|
|`R-MEDICAL-NEED`|`needs=medical`|なし|`CHECK_MEDICAL_OPTIONS`|NEXT 30 DAYS / 70|`MEDICAL_NEED`|resource|
|`R-WORK-EMPLOYMENT-NEED`|`needs=employment`|なし|`CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH`|NEXT 30 DAYS / 65|`EMPLOYMENT_NEED`|check|
|`R-WORK-LIVING-COST-NEED`|`needs=living_cost`|なし|同上|NEXT 30 DAYS / 65|`EMPLOYMENT_NEED`|check|
|`R-LIVING-COST-NEED`|`needs=living_cost`|なし|`CHECK_LIVING_COST_SUPPORT`|THIS WEEK / 78|`LIVING_COST_NEED`|consult|
|`R-LANGUAGE-LEVEL`|`japaneseLevel=none`/`beginner`|daily/advanced|`FIND_LANGUAGE_SUPPORT`|THIS WEEK / 60|`LANGUAGE_BARRIER`|consult|
|`R-LANGUAGE-NEED`|`needs=language`|なし|`FIND_LANGUAGE_SUPPORT`|THIS WEEK / 65|`LANGUAGE_BARRIER`|consult|

## Selection coverage

全選択肢の完全な機械可読台帳は `packages/domain/src/selection-coverage.ts` にあり、UIの全localeと一致することをintegration testで固定する。次の表は各コードをカード選定へ使うかどうかと理由を示す。

|質問|回答コード|扱い|理由|
|---|---|---|---|
|地域|`Kita`, `Shinjuku`, `Toshima`, `Other`|地域資源filterのみ|カード種類・priorityは変えず、選定後のOpen Data絞り込みだけに使う。|
|国籍・地域|`MMR`, `OTHER`, `UNKNOWN`|カード選定に不使用|センシティブ属性のため。相談サマリー表示だけに使い、国籍別の在留・危険判断をしない。|
|来日目的|`tourism`, `visiting_family_or_friends`|使用|帰国困難時だけ短期訪問branchの優先度へ使う。公式在留資格とは扱わない。|
|来日目的|`work`, `study`, `resident`, `other`, `unknown`|使用|帰国困難時だけ非短期branchへ使う。`unknown`から制度を推測しない。|
|出国予定|`within_7_days`, `within_30_days`|使用|短期目的かつ帰国困難時だけpriority 100。|
|出国予定|`within_3_months`, `no_departure_plan`, `unknown`|使用|同条件でlater branch。それ以外は単独でカードを出さない。|
|帰国状況|`possible`|明示的no-card|単独では危機カードを出さず、別の困りごとは評価する。|
|帰国状況|`difficult`|使用|目的・出国予定・宿泊・子の年齢と組み合わせてCHECK/CONSULTを出す。|
|帰国状況|`unknown`|安全fallback|公式相談カードだけを出す。|
|滞在期限の認識|`known`|使用|有効日付があれば過去/当日/将来。日付なし・不正日付は単独no-card。|
|滞在期限の認識|`unknown`|安全fallback|公式相談カード。|
|滞在期限の認識|`documents`|安全fallback|書類確認を公式相談へ接続。|
|同行家族|`none`|明示的no-card|家族カードを推測しない。|
|同行家族|`children`|使用|年齢入力がある場合だけ教育・子育て境界を評価。|
|同行家族|`spouse`, `other`|サマリーのみ|対応する安全な本番カードがないため。|
|子の年齢|`0-2`, `3-5`|使用|`needs=childcare` の場合だけ子育てカード。|
|子の年齢|`6-11`, `12-14`, `15-17`|使用|教育・子育てカードを許可するが、就学可否は決めない。|
|子の年齢|`18+`|明示的no-card|成人を子ども向けルールへ含めない。|
|宿泊|`hotel`|使用|帰国困難との組合せで一時滞在相談。|
|宿泊|`unstable`|使用|帰国困難との組合せでより高いpriorityの滞在相談。|
|宿泊|`family_or_friend`, `rental`, `temporary_facility`|単独no-card|宿泊リスクを推測しない。`needs=accommodation` は別評価。|
|宿泊|`prefer_not_to_say`|privacy no-card|回答内容を補完しない。`needs=accommodation` は別評価。|
|困りごと|`stay`, `consultation`, `accommodation`|使用|それぞれCHECK、公式相談、一時滞在相談へ接続。|
|困りごと|`living_cost`|使用|生活費相談と、求職前の就労可否確認を表示。給付・就労可否は決めない。|
|困りごと|`employment`|使用|就労可否の公式確認だけ。求人や許可判断はしない。|
|困りごと|`education`|条件付き使用|学齢児がいる場合だけ。|
|困りごと|`childcare`|条件付き使用|18歳未満の子がいる場合だけ。|
|困りごと|`medical`|使用|医療一覧へ接続するが診療・受入可否を断定しない。|
|困りごと|`language`|使用|自己申告の日本語水準に関係なく言語支援へ接続。|
|日本語|`none`, `beginner`|使用|言語支援カード。|
|日本語|`daily`, `advanced`|単独no-card|言語障壁を推測しない。`needs=language` は別評価。|

## Tests

- 全Rule branch、priority、同点tie-break、Action重複排除、過去/当日/将来、不正日付、unknown、prefer-not-to-say、no-card境界をunit testする。
- 代表ケースは `packages/domain/tests/fixtures/rule-golden.ts` でAction ID、Rule ID、timing、priority、reason codeをgolden固定する。
- UI integrationでRule ID・採用回答コード・Sourceが同じカード内に表示されること、回答変更・reload・restartで最新カードへ再評価されることを確認する。
