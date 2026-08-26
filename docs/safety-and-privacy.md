# Safety and Privacy

## No legal or immigration decision

StayBridge Tokyo は在留延長、在留資格変更、難民・補完的保護、就労資格、就学、給付、母国の安全性を判定・予測しない。表示は CHECK / CONSULT を原則とし、公式情報・行政機関・専門家へのHuman Handoffを置く。

## AI limitations and traceability

主要導線はRule Engineで動作し、Actionは採用回答コード、安定したRule ID、Action ID、Source Registry出典を追跡できる。Action Cardの本文・注意事項・CTAはレビュー期限を持つ静的カタログで管理し、実行時に生成しない。未レビュー、期限切れ、出典不明のカードは表示せず、公式相談先へfallbackする。AIは公式窓口で何を伝え、何を確認するかの整理だけに使い、在留・就労・就学・給付などの可否や母国の安全性は判定させない。AI出力が固定ルールのカードを削除・上書き・並べ替えることはなく、AI障害時も同じRoadmap、理由、Local Action、Handoffを表示する。

AIチャットにはSituation Checkの回答を自動送信しない。ユーザーがチャット欄へ入力した会話だけをCloudflare Workers AIへ送信し、公開routeは推論結果を返すだけでD1へ自動保存しない。クライアントが付けた `assistant` roleも信頼せず、全履歴を区切られたJSON transcriptとして単一のuser messageへ格納する。入力前に個人情報を記載しないよう明示し、氏名、連絡先、旅券・在留カード番号、正確な住所、政治・宗教・迫害に関する情報は求めない。サーバー側では同一オリジン、入力長・履歴件数、レート制限を検証し、rate-limit bindingがない場合は推論せず503を返す。Roadmapの会話保存同意は将来の保存設定であり、現時点で会話が保存済みとは表示しない。

## Minimal data

ログイン不要。氏名、連絡先、旅券・在留カード番号、画像、正確な住所、母国住所、政治・宗教・政党、政治活動、迫害内容を求めない。国籍・地域の回答は相談サマリー以外のカード選定に使わない。位置情報は任意で、未許可でも自治体単位で使える。端末内セッション保存とサーバー保存は別物である。POST前に、idempotency key・削除コード・初回POSTのallowlist済み最小payloadだけをversion付きsnapshotとしてtab限定`sessionStorage`へ保存する。応答不明時は回答sessionが変更・migration・破損していてもsnapshotをそのまま再送し、未知versionや壊れたsnapshotは上書きも送信もせずfail-closedにする。保存済み・送信結果不明のSituationがある間は、回答変更routeと端末データ消去をサーバー記録の状態が解決するまでblockする。

Situation Check回答とLLM会話は別同意・別version・別テーブルで管理する。Situation側は国籍、正確な滞在期限、自由記述を送らず、自治体コード、選択式回答、粗い時間・年齢区分だけを保存する。公開デモfixtureはsession内provenanceで区別してUI保存を拒否する。Situation POSTの直前に、利用者Workerが短命・署名済み・one-time capabilityを同一originへ発行し、version・期限・nonce・scopeとD1の未消費状態を検証したrequestだけを`accepted`として保存する。署名tokenはログやD1へ保存せず、nonce hashだけを保持する。無効なrequestやbackend障害は保存前に拒否し、migration前の既存行など検証できないデータは`quarantined`として公開集計から外す。ただしこれはアカウント認証や本人証明ではなく、入力が実在利用者本人の回答であることまでは証明しない。会話側は#62のserver生成経路だけから、利用者・モデルのマスキング済み本文、サーバー固定のモデルID、trusted Source Registryで検証済みのsource ID、作成日時を保存する。Situation IDは`sit_`、会話IDは`con_`で始まる別々のサーバー生成random UUIDとし、恒久ユーザーID、アカウント、Cookieによる訪問横断追跡を持たない。

入力はNFKC正規化してから、メール・電話・検出可能な正確な住所をサーバーで伏せ字にし、空白入り・全角を含む旅券・在留カードらしい番号は保存もLLM利用も拒否する。保存する本文は正規化・マスキング後だけとし、未マスキング本文、request body、D1 record全体をログへ出力しない。ただし検出は完全ではないため、個人情報を入力しない警告を同意UIに常時表示する。

マスキングまたは拒否を通過した同意済みデータは期限を設けず保持する。従来の保持期限経過後の自動削除条件はこの方針に置き換わり、期限削除jobは設けない。各記録の削除コードはブラウザへ一度返し、D1ではSHA-256 hashだけを保持する。本人が削除するまで、記録IDと削除コードは同じタブの専用`sessionStorage`にも保持し、route remountや再読込で復元する。回答見直し・最初からやり直す・端末データ消去は、先にサーバー記録を削除するまで止める。タブ終了前に本人が控えられるcopy UIを置くが、Cookieや訪問横断追跡には利用しない。記録IDと削除コードの保有者だけがDELETEでき、コードの再発行や管理者による本人照合は行わない。データはサービスの運用・安全確認以外に利用せず、モデル学習、マーケティング、個人プロファイル等の二次利用を行わない。

## Crisis View

自治体単位の集計に限定し、個人位置・住所・追跡・個人リスク推定を表示しない。国籍データはセンシティブな文脈で使われうるため、支援準備以外の用途や能力・不足の断定を避ける。自治体Workerの固定`GET /api/crisis/needs`は、同意済みかつ`accepted`の`situation_submissions`だけを対象にし、`quarantined`をすべての全体・カテゴリqueryから除外したうえで、全体・カテゴリとも最小公開件数k=5未満を抑制する。会話本文、conversation ID、source ID、会話集計、モデル応答、Situation個票をCrisis ViewのAPIや画面へ返さず、query・SQLとも会話テーブルに触れない。最終更新は個人時刻でなくJST日付へ粗視化し、回答件数とともに最小公開件数以上の場合だけ返す。この閾値は人物単位のk-anonymityではなく、少数データをそのまま公開しないためのsparse-data suppressionであり、集計単位は人物ではなくsubmissionである。任意回答の集計はOpen Data、人口、支援不足、優先度、サービス提供能力の指標ではない。

## Freshness

出典、更新日、取得日、fixture区分を表示する。古い・欠損したデータを最新事実のように扱わず、データなしは明示する。
