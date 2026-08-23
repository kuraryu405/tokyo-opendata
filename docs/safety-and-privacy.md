# Safety and Privacy

## No legal or immigration decision

StayBridge Tokyo は在留延長、在留資格変更、難民・補完的保護、就労資格、就学、給付、母国の安全性を判定・予測しない。表示は CHECK / CONSULT を原則とし、公式情報・行政機関・専門家へのHuman Handoffを置く。

## AI limitations and traceability

主要導線はRule Engineで動作し、Actionは採用回答コード、安定したRule ID、Action ID、Source Registry出典を追跡できる。Action Cardの本文・注意事項・CTAはレビュー期限を持つ静的カタログで管理し、実行時に生成しない。未レビュー、期限切れ、出典不明のカードは表示せず、公式相談先へfallbackする。MVPの翻訳は静的モックでありAI/APIは未接続。将来AIを使う場合も翻訳・やさしい日本語・定型説明の補助に限定し、自由記述やAI出力が固定ルールのカードを削除・上書き・並べ替えない。AI障害時も同じRoadmap、理由、Local Action、Handoffを表示する。

## Minimal data

ログイン不要。氏名、連絡先、旅券・在留カード番号、画像、正確な住所、母国住所、政治・宗教・政党、政治活動、迫害内容を求めない。国籍・地域の回答は相談サマリー以外のカード選定に使わない。位置情報は任意で、未許可でも自治体単位で使える。保存するなら最小限の端末内状態とし、消去手段を提供する。

## Crisis View

自治体単位の集計に限定し、個人位置・住所・追跡・個人リスク推定を表示しない。国籍データはセンシティブな文脈で使われうるため、支援準備以外の用途や能力・不足の断定を避ける。

## Freshness

出典、更新日、取得日、fixture区分を表示する。古い・欠損したデータを最新事実のように扱わず、データなしは明示する。
