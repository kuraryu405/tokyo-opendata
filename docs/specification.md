# Implementation Specification

## Screens and navigation

`/` Landing（言語・開始・Crisis View導線）→ Situation Check → Immediate Status → Roadmap → Local Action → Support Detail / Human Support → Consultation Summary。本人向けナビゲーションは Home / My Steps / Local Support / Help に限定する。`/crisis` は支援準備向けで、個人画面と分離する。

## Situation states

地域は自治体レベルのみ。位置情報は任意。質問は一画面一問、進捗を表示する。未回答の内部初期値は選択済みとして描画しない。地域、国籍・地域、来日目的、同伴家族で「その他」を選んだ場合は自由記述を必須にする（来日目的は最大300文字、ほかは最大100文字）。回答と検証済み追加カードIDは最小限のセッション状態に保存し、消去できる。Workers AIへ送信するのは来日目的の記述だけとする。Persona A demo seed を読み込める。

## Roadmap / Local Action

Actionは TODAY、THIS WEEK、NEXT 30 DAYS、BEFORE DEADLINE、LONG TERM にグループ化し、優先度順に表示する。各主要アクションは「なぜこの案内？」と User Input → Rule/限定分類 → Action → Source を開示する。Workers AIは自由記述だけを受け取り、JSON Schemaで許可済みAction IDを0〜3件返す。サーバーとクライアントで再検証し、Rule Engineの結果へ重複排除して追加する。来日目的を編集した場合は以前の追加IDを破棄する。AI APIは本文サイズと呼出回数を制限し、AI障害・タイムアウト・不正出力・制限超過時はRule Engineだけを表示する。学校カードには就学可否を断定しない注意、医療カードにはデータに存在する項目だけを表示する。

## Crisis View

MVPでは対応済みの固定対象（北区・ミャンマー）について、Potential Impact、Existing Resources、Data Gap、対応検討項目を表示する。未対応の国籍・自治体を選択できるようには見せない。「不足」と断定せず、能力は要確認とする。人口統計のcoverage noteを常時示す。

## States / i18n

読み込み中は意味のあるskeleton、失敗時は再試行・自治体公式サイト・相談先、データなしは未対応を明示する。翻訳辞書は分離し、ミャンマー語は専門家レビュー可能な構成とする。
