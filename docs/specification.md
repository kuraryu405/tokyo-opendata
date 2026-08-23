# Implementation Specification

## Screens and navigation

本人向けアプリの `/` は Landing（言語・開始・Crisis View導線）→ Situation Check → Immediate Status → Roadmap → Local Action → Support Detail / Human Support → Consultation Summary を提供する。本人向けナビゲーションは Home / My Steps / Local Support / Help に限定する。自治体向けアプリの `/` は支援準備向けで、本人向け画面と分離する。

## Situation states

地域は自治体レベルのみ。位置情報は任意。質問は一画面一問、進捗を表示する。回答は最小限のクライアント状態に保存し、消去できる。Persona A demo seed を読み込める。

## Roadmap / Local Action

Actionは TODAY、THIS WEEK、NEXT 30 DAYS、BEFORE DEADLINE、LONG TERM にグループ化し、優先度順に表示する。カード内容は選定ルールから分離した型付き静的カタログから解決する。Rule Engineへは `Situation`、滞在回答コード、必須の `asOfDate` を渡し、Rule ID、Action ID、priority、timing、reason code、採用回答コードを返す。同じAction IDは最高priority、同点はRule ID昇順で1枚にする。各主要アクションは注意事項と「なぜこの案内？」に採用Rule ID・回答コード・Source Registry出典を開示する。学校カードには就学可否を断定しない注意、医療カードにはデータに存在する項目だけを表示する。未レビュー、期限切れ、出典不明のカードは表示せず、表示可能カードがない場合は公式相談先へfallbackする。

期限は `deadline < asOfDate` を過去、`=` を当日、`>` を将来として別Rule IDで扱う。不正日付は期限ルールへ入れず、`asOfDate` 自体が不正なら評価を失敗させる。帰国状況または滞在期限が不明なら公式相談カードを出す。既知で有効な期限がなく、他の条件・困りごとも該当しない場合は空fallbackを出す。

## Crisis View

MVPでは対応済みの固定対象（北区・ミャンマー）について、Potential Impact、Existing Resources、Data Gap、対応検討項目を表示する。未対応の国籍・自治体を選択できるようには見せない。「不足」と断定せず、能力は要確認とする。人口統計のcoverage noteを常時示す。

## States / i18n

読み込み中は意味のあるskeleton、失敗時は再試行・自治体公式サイト・相談先、データなしは未対応を明示する。翻訳辞書は分離する。専門家翻訳は未実施で、`expertReview` を未完了のまま保持する。
