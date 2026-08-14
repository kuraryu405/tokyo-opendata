# Architecture

```mermaid
flowchart TD
  B[Browser] --> S[Situation Check]
  S --> R[Pure Rule Engine]
  R --> A[Action Resolver]
  O[Official Source Registry] --> A
  D[Raw Open Data] --> N[Adapter / Normalizer]
  N --> C[Normalized Common Schema + metadata]
  C --> L[Local Action]
  A --> P[Personal Roadmap]
  P --> H[Human Handoff / Consultation Summary]
  S --> L
  C --> CV[Crisis Support View]
  POP[Normalized Population Data] --> CV
  CV --> M[Municipality Detail]
  M --> G[Data Gap + 対応検討項目]
```

主要判断は `generateActions(situation, context)` のような純粋関数で行う。UIは生データやURLを直接持たず、Source Registry と正規化スキーマを参照する。公式情報は確認すべき事項、Open Dataは地域資源・支援準備を担当する。外部データは取得・正規化して同梱し、画面表示時のネットワーク障害を避ける。
