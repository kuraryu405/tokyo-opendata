# Implementation Specification

## Screens and navigation

本人向けアプリの `/` は Landing（言語・開始・Crisis View導線）→ Situation Check → Immediate Status → Roadmap → Local Action → Support Detail / Human Support → Consultation Summary を提供する。本人向けナビゲーションは Home / My Steps / Local Support / Help に限定する。自治体向けアプリの `/` は支援準備向けで、本人向け画面と分離する。

## Situation states

地域は自治体レベルのみ。位置情報は任意。質問は一画面一問、進捗を表示する。未回答の内部初期値は選択済みとして描画しない。地域、国籍・地域、来日目的、同伴家族で「その他」を選んだ場合は自由記述を必須にする（来日目的は最大300文字、ほかは最大100文字）。回答と検証済み追加カードIDは最小限のセッション状態に保存し、消去できる。Workers AIへ送信するのは来日目的の記述だけとする。Persona A demo seed を読み込める。

## Roadmap / Local Action

Actionは TODAY、THIS WEEK、NEXT 30 DAYS、BEFORE DEADLINE、LONG TERM にグループ化し、優先度順に表示する。カード内容は選定ルールから分離した型付き静的カタログから解決し、各主要アクションは注意事項と「なぜこの案内？」、User Input → Rule/限定分類 → Action → Source を開示する。Workers AIは自由記述だけを受け取り、JSON Schemaで許可済みAction IDを0〜3件返す。サーバーとクライアントで再検証し、静的カタログのレビュー・期限・Source検証を通過したカードだけをRule Engineの結果へ重複排除して追加する。来日目的を編集した場合は以前の追加IDを破棄する。AI APIは本文サイズと呼出回数を制限し、AI障害・タイムアウト・不正出力・制限超過時はRule Engineだけを表示する。学校カードには就学可否を断定しない注意、医療カードにはデータに存在する項目だけを表示する。未レビュー、期限切れ、出典不明のカードは表示せず、表示可能カードがない場合は公式相談先へfallbackする。

## AI support preparation

Personal Roadmap画面では、アクションカード横の補助領域に開閉操作のないAIチャットを表示する。狭い画面ではロードマップと縦積みにする。初期表示はタイトル、簡潔な注意、質問例、自由入力に絞る。AIは窓口で説明する内容と確認する質問の整理に限定する。Situation Checkの回答は自動送信せず、チャット入力と直近7件までの会話だけをCloudflare Workers AIへ送る。クライアント由来の全履歴は表示roleを信頼せず、区切られたJSON transcriptを単一のuser messageとして推論へ渡す。会話は再読み込みで消去し、ユーザーは画面上からも消去できる。モデル未接続、推論失敗、タイムアウト、rate-limit binding欠損、レート超過時は公式相談先を使うよう案内し、他の画面・機能を停止しない。

## Crisis View

MVPでは対応済みの固定対象（北区・ミャンマー）について、Potential Impact、Existing Resources、Data Gap、対応検討項目を表示する。未対応の国籍・自治体を選択できるようには見せない。「不足」と断定せず、能力は要確認とする。人口統計のcoverage noteを常時示す。

## States / i18n

読み込み中は意味のあるskeleton、失敗時は再試行・自治体公式サイト・相談先、データなしは未対応を明示する。翻訳辞書は分離し、ミャンマー語は専門家レビュー可能な構成とする。
