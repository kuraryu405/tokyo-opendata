# Architecture

```mermaid
flowchart TD
  UB[利用者ブラウザ] --> UA[利用者アプリ]
  UA --> S[Situation Check]
  S --> R[Pure Rule Engine]
  R --> A[Action Resolver]
  O[Official Source Registry] --> A
  D[Raw Open Data] --> N[Adapter / Normalizer]
  N --> C[Normalized Common Schema + metadata]
  C --> L[Local Action]
  A --> P[Personal Roadmap]
  P --> H[Human Handoff / Consultation Summary]
  P --> CHT[AI Support Preparation]
  CHT --> H
  S --> L
  MB[自治体ブラウザ] --> MA[自治体アプリ]
  MA --> CV[Crisis Support View]
  UA -. typed STAYBRIDGE_DB .-> D1[(D1: local / staging / production)]
  MA -. typed STAYBRIDGE_DB .-> D1
  D1 -. situation_submissions only / k>=5 .-> CV
  C --> CV
  POP[Normalized Population Data] --> CV
  CV --> M[Municipality Detail]
  M --> G[Data Gap + 対応検討項目]
```

主要判断は `generateActions(situation, { asOfDate, stayAnswer })` の純粋関数で行う。`packages/domain/src/rules.ts` の固定ルール表が型付き回答コードをRule IDへ対応させ、Action IDごとに決定的に重複排除する。Action Resolverは勝者のRule ID・回答コードを保持したまま、`action-catalog.ts` とSource Registryからレビュー済みカードを解決する。Rule EngineはAI、外部API、D1、表示ラベル、現在時計を参照しない。

利用者アプリと自治体アプリは別々にビルドされ、domain/data/worker-runtimeのworkspace packageを共有する。両Workerは型付き`STAYBRIDGE_DB` Bindingを持ち、利用者Workerだけがversion付き同意を検証してSituation回答を公開routeから保存する。自治体Workerは固定`GET /api/crisis/needs`で`situation_submissions`のみを読み、自治体・東京暦期間・単一allowlist軸ごとにk=5以上の匿名集計だけをCrisis Viewへ渡す。会話テーブルへの作成は公開せず、`/api/support-chat`が現在のuser入力と同じrequestでserver生成したreplyだけをserver-internal関数へ渡す。そこでNFKC正規化、識別子拒否、連絡先等のマスキング、固定model/source検証を終えてから保存する。browser由来の過去assistant履歴は推論用untrusted transcriptに留め、trusted recordへ昇格しない。自治体WorkerとCrisis Viewには会話本文・会話集計・個票routeを設けない。D1の運用契約は [Workers・D1バックエンド基盤](backend-d1.md) を参照する。UIは生データやURLを直接持たず、Source Registry と正規化スキーマを参照する。公式情報は確認すべき事項、Open Dataは地域資源・支援準備を担当する。外部データは取得・正規化して同梱し、画面表示時のネットワーク障害を避ける。

AI Support Preparationは利用者Worker内のCloudflare Workers AI bindingを使う独立した補助導線で、相談画面に入力した会話だけを送信する。Situation Checkの回答、Rule Engineの判断、Source Registryはモデル入力にせず、モデル障害時も主要導線を維持する。クライアント由来の会話履歴はroleを信頼せず、区切られたJSON transcriptを単一のuser messageとして推論へ渡す。会話保存同意はversion付きtab sessionとして復元し、保存request前にidempotency keyと削除コードを保持する。応答消失時はD1のserver-written messageからreplyとrecord IDを回収し、同じidempotency keyで別内容を作らない。
