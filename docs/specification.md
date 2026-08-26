# Implementation Specification

## Screens and navigation

本人向けアプリの `/` は Landing（言語・開始・Crisis View導線）→ Situation Check → Immediate Status → Roadmap → Local Action → Support Detail / Human Support → Consultation Summary を提供する。本人向けナビゲーションは Home / My Steps / Local Support / Help に限定する。自治体向けアプリの `/` は支援準備向けで、本人向け画面と分離する。

## Situation states

地域は自治体レベルのみ。位置情報は任意。質問は一画面一問、進捗を表示する。回答は最小限のクライアント状態に保存し、消去できる。Persona A demo seed を読み込める。完了画面ではSituation回答のD1保存を任意で同意でき、不同意・保存失敗でもRoadmapへ進める。保存対象から国籍、正確な期限、自由記述を除外する。送信結果不明時のidempotency keyと削除コードをtab限定で復元し、同じrequestを再試行する。AI会話の保存同意はRoadmapで別preferenceとして扱い、Situation同意を流用せず、#62が会話を生成するまでは保存済みと表示しない。

## Roadmap / Local Action

Actionは TODAY、THIS WEEK、NEXT 30 DAYS、BEFORE DEADLINE、LONG TERM にグループ化し、優先度順に表示する。カード内容は選定ルールから分離した型付き静的カタログから解決する。Rule Engineへは `Situation`、滞在回答コード、必須の `asOfDate` を渡し、Rule ID、Action ID、priority、timing、reason code、採用回答コードを返す。同じAction IDは最高priority、同点はRule ID昇順で1枚にする。各主要アクションは注意事項と「なぜこの案内？」に採用Rule ID・回答コード・Source Registry出典を開示する。学校カードには就学可否を断定しない注意、医療カードにはデータに存在する項目だけを表示する。未レビュー、期限切れ、出典不明のカードは表示せず、表示可能カードがない場合は公式相談先へfallbackする。

期限は `deadline < asOfDate` を過去、`=` を当日、`>` を将来として別Rule IDで扱う。不正日付は期限ルールへ入れず、`asOfDate` 自体が不正なら評価を失敗させる。帰国状況または滞在期限が不明なら公式相談カードを出す。既知で有効な期限がなく、他の条件・困りごとも該当しない場合は空fallbackを出す。

## AI support preparation

Personal Roadmap画面では、アクションカード横の補助領域に開閉操作のないAIチャットを表示する。狭い画面ではロードマップと縦積みにする。初期表示はタイトル、簡潔な注意、質問例、自由入力に絞る。AIは窓口で説明する内容と確認する質問の整理に限定する。Situation Checkの回答は自動送信せず、チャット入力と直近7件までの会話だけをCloudflare Workers AIへ送る。クライアント由来の全履歴は表示roleを信頼せず、区切られたJSON transcriptを単一のuser messageとして推論へ渡す。会話は再読み込みで消去し、ユーザーは画面上からも消去できる。モデル未接続、推論失敗、タイムアウト、rate-limit binding欠損、レート超過時は公式相談先を使うよう案内し、他の画面・機能を停止しない。

## Crisis View

MVPでは対応済みの固定対象（北区・ミャンマー）について、Potential Impact、Existing Resources、Data Gap、対応検討項目を表示する。未対応の国籍・自治体を選択できるようには見せない。「不足」と断定せず、能力は要確認とする。人口統計のcoverage noteを常時示す。公式Open Dataとは別に、同意済みSituation回答の集計を期間（東京暦の7/30/90日）と1軸（needs / return_status / departure_window / accommodation）で表示できる。全体とカテゴリは最小公開件数k=5以上のときだけ表示し、no_data / below_threshold / stale / error / loadingを区別する。回答件数（submission単位）とJST最終集計日は安全な場合だけ表示し、人口・不足・優先度・サービス提供能力の推定ではないことを常時示す。

## States / i18n

読み込み中は意味のあるskeleton、失敗時は再試行・自治体公式サイト・相談先、データなしは未対応を明示する。保存同意は未選択・同意・不同意・保存中・保存済み・保存失敗・削除中・削除済み・削除失敗を区別する。翻訳辞書は分離し、日本語・英語・ミャンマー語の現在locale routeに追従する。専門家翻訳は未実施で、`expertReview` を未完了のまま保持する。
