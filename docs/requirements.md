# Requirements

## Business / User requirements

- 情報を行政組織単位ではなく、本人の時間軸の次の行動へ変換する。
- 短期滞在し子どもと同行する人が、制度名を知らずに完走できる。
- 行政・支援者は地域資源とデータ不足を踏まえ、対応検討項目を確認できる。

## Functional requirements

- 日本語、English、မြန်မာဘာသာを選択可能にし、少なくとも英語の主導線を完成させる。
- 1問ずつの Situation Check（地域、国籍、来日目的、帰国予定・状況、滞在期限、家族、子の年齢、宿泊、困りごと、日本語）を提供する。
- Rule Engine が型付き回答コードだけから説明可能な Action Card を生成する。ルールは安定したRule ID、条件・除外、Action ID、timing、priority、reason code、出典・安全要件を持ち、カードは型付き静的カタログを正本とする。
- Local Action は学校、医療、子育て、公共施設を、位置情報なしでも自治体単位で表示する。
- Consultation Summary は入力済み情報のみをコピー・印刷向けに整理する。
- 自治体向けアプリの `/` で Preparedness View を提供し、人口、資源、Data Gap、表示名「対応検討項目」を示す。
- Situation Check回答とLLM会話は別の同意状態・同意version・D1テーブルで扱う。不同意または保存失敗でもRule Engineと主要導線を継続する。
- Situation回答の保存対象は自治体コード、選択式回答、粗い時間・年齢区分に限定し、国籍、正確な日付・住所、自由記述を含めない。
- LLM会話は#62のserver生成経路からだけ作成し、NFKC正規化・マスキング済み本文、サーバー固定のモデルID、trusted registryで検証済みのsource ID、作成日時だけを保存する。公開作成・一覧APIを提供せず、#59のUIは保存同意preferenceだけを扱う。
- 保存後に表示する記録IDと削除コードの保有者が、Situation回答・会話を個別に削除できる。
- 自治体Workerは、同意済みSituation回答だけを対象に、自治体13117・東京暦の期間・単一allowlist軸で、最小公開件数k=5のsubmission単位集計を返せる。会話・個票を読取らず、5件未満の全体・カテゴリ数を返さない。

## Non-functional / Data requirements

- モバイルファースト、キーボード操作、ラベル、コントラスト、エラー・空・ローディング状態を実装する。
- Source Registry と正規化データを介し、出典・更新情報を追跡可能にする。
- 未レビュー、レビュー期限切れ、Source Registryで解決できないAction Cardを利用者へ表示しない。
- 同じAction IDは1枚へ重複排除し、priority、timing、reason、Rule IDを単一の勝者から決定する。同点はRule ID昇順、最終一覧はpriority降順・Action ID昇順とする。
- 評価日はサーバーのリクエスト境界で東京日付を `asOfDate` として必須注入し、利用者端末の時計に依存せず、過去・当日・将来の期限を別ルールで扱う。
- Open Dataは利用者の Local Action と行政の支援準備の双方に直接利用する。
- Situation保存APIはJSON Content-Type、body byte数、厳格schema、同一origin、重複送信、Rate Limitを検証する。server-internal会話保存境界は文字数・件数、role、model/source provenanceを検証する。

## Safety / AI / Privacy

- AIは補助的な翻訳・平易化のみ。主要フローはAIなしで動く。
- 在留、難民、就労、就学、給付、危険度を自動判定しない。個別判断は公式窓口へ。
- 国籍・地域はカード選定に使用しない。分からない回答は相談fallback、答えたくない回答は明記した空fallbackとし、推測で補完しない。
- ログイン不要、最小データ、正確な住所や識別子は収集しない。恒久ユーザーID、Cookie横断追跡、学習・二次利用を導入しない。
- LLMへ渡す前と保存前に同じサーバー側検査を通し、メール・電話・検出可能な正確な住所は伏せ字、旅券・在留カードらしい識別子は拒否する。生の未マスキング入力をD1やログへ残さない。
- マスキングまたは拒否を通過した同意済みデータは無期限保持する。これは従来の保持期限後の自動削除条件を置き換える。削除コードはhashだけを保存する。
- 公開デモfixtureはSituation保存の対象外とし、route遷移・再読込後もprovenanceを保持して実回答と混在させない。

## Acceptance criteria

Persona A を読み込み、滞在確認・相談・教育・医療・就労前確認を含むロードマップ、Local Action、相談サマリー、Crisis ViewのData Gapまで一貫して表示できること。未対応データでは推測せず空状態を示すこと。

## Out of scope

アカウント、OCR、電子申請、一般AIチャット、ライブ相談、全国完全対応、リアルタイム危機検出、個人追跡、ML予測、個票または会話の集計・Crisis View反映、会話一覧表示、学習利用。
