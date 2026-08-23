# Implementation Specification

## Screens and navigation

本人向けアプリの `/` は Landing（言語・開始・Crisis View導線）→ Situation Check → Immediate Status → Roadmap → Local Action → Support Detail / Human Support → Consultation Summary を提供する。本人向けナビゲーションは Home / My Steps / Local Support / Help に限定する。自治体向けアプリの `/` は支援準備向けで、本人向け画面と分離する。

## Situation states

地域は自治体レベルのみ。位置情報は任意。質問は一画面一問、進捗を表示する。回答は最小限のクライアント状態に保存し、消去できる。Persona A demo seed を読み込める。

## Roadmap / Local Action

Actionは TODAY、THIS WEEK、NEXT 30 DAYS、BEFORE DEADLINE、LONG TERM にグループ化し、優先度順に表示する。各主要アクションは「なぜこの案内？」と User Input → Rule → Action → Source を開示する。学校カードには就学可否を断定しない注意、医療カードにはデータに存在する項目だけを表示する。

## Crisis View

MVPでは対応済みの固定対象（北区・ミャンマー）について、Potential Impact、Existing Resources、Data Gap、対応検討項目を表示する。未対応の国籍・自治体を選択できるようには見せない。「不足」と断定せず、能力は要確認とする。人口統計のcoverage noteを常時示す。

## States / i18n

読み込み中は意味のあるskeleton、失敗時は再試行・自治体公式サイト・相談先、データなしは未対応を明示する。翻訳辞書は分離し、ミャンマー語は専門家レビュー可能な構成とする。
