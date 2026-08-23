# Requirements

## Business / User requirements

- 情報を行政組織単位ではなく、本人の時間軸の次の行動へ変換する。
- 短期滞在し子どもと同行する人が、制度名を知らずに完走できる。
- 行政・支援者は地域資源とデータ不足を踏まえ、対応検討項目を確認できる。

## Functional requirements

- 日本語、English、မြန်မာဘာသာを選択可能にし、少なくとも英語の主導線を完成させる。
- 1問ずつの Situation Check（地域、国籍、来日目的、帰国予定・状況、滞在期限、家族、子の年齢、宿泊、困りごと、日本語）を提供する。
- Rule Engine が説明可能な Action Card を生成する。カードは timing、priority、why、source、lastVerified、CTA、humanReviewRequired を持つ。
- Local Action は学校、医療、子育て、公共施設を、位置情報なしでも自治体単位で表示する。
- Consultation Summary は入力済み情報のみをコピー・印刷向けに整理する。
- 自治体向けアプリの `/` で Preparedness View を提供し、人口、資源、Data Gap、表示名「対応検討項目」を示す。

## Non-functional / Data requirements

- モバイルファースト、キーボード操作、ラベル、コントラスト、エラー・空・ローディング状態を実装する。
- Source Registry と正規化データを介し、出典・更新情報を追跡可能にする。
- Open Dataは利用者の Local Action と行政の支援準備の双方に直接利用する。

## Safety / AI / Privacy

- AIは補助的な翻訳・平易化のみ。主要フローはAIなしで動く。
- 在留、難民、就労、就学、給付、危険度を自動判定しない。個別判断は公式窓口へ。
- ログイン不要、最小データ、正確な住所や識別子は収集しない。

## Acceptance criteria

Persona A を読み込み、滞在確認・相談・教育・医療・就労前確認を含むロードマップ、Local Action、相談サマリー、Crisis ViewのData Gapまで一貫して表示できること。未対応データでは推測せず空状態を示すこと。

## Out of scope

アカウント、OCR、電子申請、一般AIチャット、ライブ相談、全国完全対応、リアルタイム危機検出、個人追跡、ML予測。
