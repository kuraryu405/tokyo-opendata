# Workers・D1 バックエンド基盤

利用者アプリと自治体アプリは、独立 API Worker を追加せず、それぞれの既存 Worker から同じ D1 を参照します。Binding 名は `STAYBRIDGE_DB`、型は `BackendEnv` で一元化しています。

## 環境分離

| 環境 | データベース名 | 接続方法 |
| --- | --- | --- |
| local | `staybridge-local` | ローカル Miniflare。常に既定 |
| staging | `staybridge-staging` | 明示的な remote 設定だけ |
| production | `staybridge-production` | 明示的な remote 設定と変更承認が必要 |

`apps/*/wrangler.jsonc` の ID は失敗安全な placeholder です。ローカル Binding には `remote: false` があり、`pnpm dev` や `db:local:*` は Cloudflare 上の D1 を参照しません。CD は GitHub repository variables `STAYBRIDGE_STAGING_D1_DATABASE_ID` と `STAYBRIDGE_PRODUCTION_D1_DATABASE_ID` をデプロイ直前の成果物へ注入し、未設定、placeholder、同一 ID を拒否します。実 ID をリポジトリへ記録する必要はありません。

`compatibility_date` は Wrangler 4.92.0 に同梱された workerd が対応する `2026-05-15` です。

## ローカル初期化と確認

初期化は migration の後に seed を実行します。migration は `database/migrations`、seed は `database/seed.sql` が正本です。seed は同じ内容を繰り返し適用できます。

```bash
pnpm db:local:init
pnpm db:local:status
pnpm db:local:verify
pnpm dev
```

`db:local:status` が `No migrations to apply`、`db:local:verify` が `seed_version = 1` を返せば初期化済みです。完全に空の DB で検証するときは、別の一時ディレクトリを `--persist-to` に指定して `db:local:migrate` と同じ Wrangler コマンドを実行してください。`.wrangler/` は Git 管理外です。

## remote 環境の作成と migration

Cloudflare アカウントで一度だけ、別々の DB を作成します。この操作は通常の PR/CI では行いません。

```bash
pnpm exec wrangler d1 create staybridge-staging
pnpm exec wrangler d1 create staybridge-production
```

返された各 ID を前述の GitHub repository variables に登録します。手動の状態確認や migration では、ID を含む一時設定を Git 管理外へ生成します。次は staging の例です。

```bash
node scripts/d1/prepare-remote-config.mjs staging "$STAGING_D1_DATABASE_ID"
pnpm exec wrangler d1 migrations list STAYBRIDGE_DB \
  --remote --config .wrangler/d1/staging.json
pnpm exec wrangler d1 migrations apply STAYBRIDGE_DB \
  --remote --config .wrangler/d1/staging.json
pnpm exec wrangler d1 execute STAYBRIDGE_DB \
  --remote --config .wrangler/d1/staging.json \
  --file database/seed.sql --yes
```

production は `production` と production ID で一時設定を作りますが、適用前に変更内容、対象 ID、backup、rollback 手順をレビューしてください。CI/CD は production migration や seed を自動実行しません。

## API と health contract

- `GET /healthz`: Worker 自体の liveness。D1 へ問い合わせません。
- `GET /readyz`: `SELECT 1` で D1 readiness を確認します。
- API 成功: `{ "ok": true, "data": ... }`
- 入力・method エラー: `{ "ok": false, "error": { "code": "...", "message": "..." } }`
- D1 一時障害: HTTP 503 と `SERVICE_UNAVAILABLE`。SQL、Binding ID、内部例外は返しません。

### 同意済みデータ保存API

- `POST /api/situation-submissions`: version付きSituation同意と厳格allowlist回答を保存。
- `DELETE /api/situation-submissions/:sit_id`: `Authorization: Bearer <deletion-code>`で該当記録だけを削除。
- 会話作成の公開HTTP routeは#59では提供しない。`POST /api/conversations`は405で拒否し、browserが作ったassistant本文、model ID、source IDをtrusted provenanceとして保存しない。
- server-internal `persistVerifiedConversation`だけが、#62でserver生成したassistant本文、server固定model ID、trusted Source Registryのsource IDを検証し、NFKC正規化・マスキング後に保存できる。
- `DELETE /api/conversations/:con_id`: deletion code保有者が会話とmessageを削除。
- `GET /api/conversations`を含む一覧・取得APIは提供しない。

Situation POSTは`application/json`、48,000 byte以下を必須とし、同一origin、1分20回のCloudflare Rate Limit、payloadとtokenを含むhashでのidempotencyを検証します。同じidempotency keyを別payloadへ再利用すると409です。会話のserver-internal境界は20件以下・1件2,000文字以下、role交互、source ID 12件以下に制限します。Rate Limitのkeyには接続IPを利用しますがD1へ保存せず、Cookieや恒久ユーザーIDを発行しません。

`situation_submissions`、`conversations`、`conversation_messages`は分離し、未マスキング本文やraw requestは保存しません。削除コード・idempotency keyはSHA-256 hashだけをD1へ保存します。`expires_at`と期限削除jobは持たず、検査通過後の同意済みデータは無期限保持です。保存・削除APIは回答本文やD1例外をログ出力せず、失敗時は一般化したエラーだけを返します。

staging/production の smoke test は liveness と readiness の両方を確認します。readiness が 503 の場合は、対象環境の Worker Binding が `STAYBRIDGE_DB` か、DB ID が対象環境のものか、D1 が利用可能かを Cloudflare 側で確認します。レスポンスに内部詳細を追加して調査しないでください。
