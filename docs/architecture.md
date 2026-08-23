# Architecture

## Verified assistant boundary

`apps/user/worker` にだけ固定 `POST /api/verified-assistant` があり、自治体WorkerにはAI binding・assistant route・assistant rate limitを置かない。入力は同一origin JSON、8KiB、質問2,000 byte、交互かつ最大7件の履歴に限定する。#59のPII拒否/マスキングをAI・保存前に実行し、モデル出力はallowlist済みintent/resource/source/action ID JSONだけを受理する。出典付き最終回答はactive D1 normalized dataset（失敗時はverified bundle）とSource Registry metadataから決定的に生成する。

```mermaid
flowchart TD
  UB[利用者ブラウザ] --> UA[利用者アプリ]
  UA --> S[Situation Check]
  S --> R[Pure Rule Engine]
  R --> A[Action Resolver]
  O[Official Source Registry] --> A
  D[Raw Open Data] --> N[Adapter / Normalizer]
  N --> V[Validate every row]
  V --> DV[D1 versioned dataset]
  DV --> C[Active Common Schema + metadata]
  B[Bundled verified fallback] -. D1 unavailable .-> C
  C --> L[Local Action]
  A --> P[Personal Roadmap]
  P --> H[Human Handoff / Consultation Summary]
  S --> L
  MB[自治体ブラウザ] --> MA[自治体アプリ]
  MA --> CV[Crisis Support View]
  UA -. typed STAYBRIDGE_DB .-> D1[(D1: local / staging / production)]
  MA -. typed STAYBRIDGE_DB .-> D1
  C --> CV
  POP[Normalized Population Data] --> CV
  CV --> M[Municipality Detail]
  M --> G[Data Gap + 対応検討項目]
```

主要判断は `generateActions(situation, context)` のような純粋関数で行う。利用者アプリと自治体アプリは別々にビルドされ、domain/data/worker-runtimeのworkspace packageを共有する。両Workerは型付き`STAYBRIDGE_DB` Bindingを持ち、検証済みOpen Dataのactive datasetを共有する。利用者Workerだけがversion付き同意を検証してSituation回答を公開routeから保存する。会話テーブルへの作成は公開せず、#62のserver生成経路がserver-internal関数を呼ぶ場合だけ、NFKC正規化、識別子拒否、連絡先等のマスキング、固定model/trusted source検証を終えてから保存する。自治体WorkerとCrisis Viewには会話本文のrouteを設けない。D1の運用契約は [Workers・D1バックエンド基盤](backend-d1.md) を参照する。UIと公開APIは生データや任意URLを直接扱わず、Source Registry と正規化スキーマを参照する。公式情報は確認すべき事項、Open Dataは地域資源・支援準備を担当する。外部データは取得・正規化して同梱し、画面表示時のネットワーク障害を避ける。
