# Runtime Configuration Reference

Worker実行時に必要なbinding・var・secretを環境別にまとめた参照。CI側のsecretsは [CIとE2E](ci-and-e2e.md) を参照する。

## 設定の出所

| 出所 | 意味 |
| --- | --- |
| wrangler.jsonc | リポジトリ内の `apps/*/wrangler.jsonc` に定義。変更はPRでレビューする |
| CD注入 | デプロイ時に `.github/workflows/deploy-worker.yml` が成果物のwrangler設定へ書き込む。手動登録不要 |
| 手動登録 | Cloudflare dashboard / wrangler secret put で各環境へ事前登録する |

## 利用者アプリ (apps/user)

| 種別 | 名称 | local | staging | production | 出所 | 無い場合の挙動 |
| --- | --- | --- | --- | --- | --- | --- |
| D1 binding | `STAYBRIDGE_DB` | ○ (remote: false) | ○ | ○ | wrangler.jsonc | Situation保存・削除がfail-closed |
| Rate Limit binding | `PERSISTENCE_RATE_LIMITER` | ○ | ○ | ○ | wrangler.jsonc + CD注入(namespace_id) | Situation保存・削除が503 |
| Rate Limit binding | `SUPPORT_CHAT_RATE_LIMITER` | ○ | ○ | ○ | wrangler.jsonc + CD注入(namespace_id) | AI相談がレート制限なしではなくfail-closedで拒否される |
| AI binding | `AI` | 不要(通常) | ○ | ○ | CD注入 (`configure-ai-binding.mjs`) | AI相談は公式案内fallback。主要導線は継続 |
| var | `APP_REVISION` | 不要 | ○ | ○ | CD注入 (`--var`) | ヘルスチェックのrevision一致検証が失敗する |
| var | `COUNTERPART_APP_URL` | 不要 | ○ | ○ | CD注入 (`--var`) | 自治体アプリへのredirectが失敗時に安全な既定値を使う |
| remote AI | `STAYBRIDGE_REMOTE_AI=1` | 任意 | — | — | 手動 (.env / shell) | 未設定ならローカルは実推論しない |

- `STAYBRIDGE_REMOTE_AI=1` はローカルでの実推論を意図的に試す場合だけ設定する。課金とCloudflare認証が発生する。
- ローカルD1は `pnpm run db:local:init` でmigrate & seedする。

## 自治体アプリ (apps/municipality)

| 種別 | 名称 | local | staging | production | 出所 | 無い場合の挙動 |
| --- | --- | --- | --- | --- | --- | --- |
| D1 binding | `STAYBRIDGE_DB` | ○ (remote: false) | ○ | ○ | wrangler.jsonc | Crisis View集計APIが503 fail-closed |
| var | `APP_REVISION` | 不要 | ○ | ○ | CD注入 (`--var`) | ヘルスチェックのrevision一致検証が失敗する |
| var | `COUNTERPART_APP_URL` | 不要 | ○ | ○ | CD注入 (`--var`) | 利用者アプリへのredirectが失敗時に安全な既定値を使う |

- 自治体Workerには `AI` binding・Rate Limit bindingを持たない。`configure-rate-limits.mjs` は自治体のnamespaceを空集合として検証する。

## 契約

- namespace_idの環境間取り違えはCD(`scripts/cd/configure-rate-limits.mjs`)が検出してdeployを失敗させる。
- binding未登録時の挙動はすべて「機能を止めて公式案内や既存画面を維持」する方向(fail-closed)で統一する。新規binding追加時はこの表とREADMEを実装に合わせて更新すること。
