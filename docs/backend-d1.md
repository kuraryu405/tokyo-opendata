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

`db:local:status` が `No migrations to apply`、`db:local:verify` が `seed_version = 2` を返せば初期化済みです。完全に空の DB で検証するときは、別の一時ディレクトリを `--persist-to` に指定して `db:local:migrate` と同じ Wrangler コマンドを実行してください。`.wrangler/` は Git 管理外です。Open Data migrationは依存PRとの番号衝突を避けて`0003_open_data_cache.sql`に固定しており、このbranch単独では`0001`の次に`0003`が適用されます。

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

### Verified assistant API

利用者Workerだけが `POST /api/verified-assistant` を提供する。`application/json`、同一origin、streamを含め8KiB以下、質問2,000 byte以下、最大7件でuser/assistantが交互の履歴を必須とし、専用Cloudflare Rate Limit binding `VERIFIED_ASSISTANT_RATE_LIMITER`（10回/分）を使う。Workers AI binding `AI` はserver固定 `@cf/meta/llama-3.3-70b-instruct-fp8-fast` を使い、clientはmodelを指定できない。timeout、AI/D1失敗、不正JSON/unknown IDは出典つき決定的fallbackになる。`fetchedAt` はserver時刻から48時間以内（未来は5分まで許容）でなければならず、無効・未来・期限切れならAIを呼ばず、避難所名・住所を返さないstale handoffになる。`dataUpdatedAt` は元データ更新日であり、cache freshnessとは別に表示する。

成功payloadは `{answer, sourceIds, uncertainty, actionIds, sources}`。`sources` は公式URL、data update、fetch、coverageを持つ。モデルは選択schemaだけを返し、resource/source/action ID全てを実取得allowlistへ再検証する。会話同意が付く場合のみserver-internal `persistVerifiedConversation` を呼び、masked messages、固定model/source provenance、idempotency/deletion credentialsを保存する。保存なしはconversation tableへのwriteがゼロである。

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

## Open Data同期と公開API

`0003_open_data_cache.sql`はSource Registry、versioned dataset、正規化resource、active pointer、import runを保存する。raw CSVは保存しない。同期は`fetch → 全件validate/normalize → stage → transactional active switch`の順で行い、active切替が完了するまで既存のlast-known-goodを公開し続ける。50行未満の部分応答を拒否し、active datasetが50件を超えて増えた後は、そのactive件数から20%を超える急減も拒否する。同じraw bytesはSHA-256が同じversionとなり、resourceを重複作成しない。ETagがある場合は`If-None-Match`を送り、304を新versionとして保存しない。

両Workerが次のread-only APIを提供する。

```text
GET /api/open-data/resources?municipality=Kita&category=emergency_shelter
```

応答には`sourceId`、`datasetVersion`、`dataUpdatedAt`、`fetchedAt`、`license`、`licenseUrl`、`catalogUrl`、`attribution`、`origin`、`resources`が含まれる。D1 active datasetの検証済み行を返す場合は`origin=d1`、activeがないかD1 readに失敗した場合は56件の同梱済み検証データを`origin=bundled`で返す。外部CSV障害時にも公開GETは外部取得を行わない。

手動同期は自治体Workerだけが提供する。`OPEN_DATA_SYNC_SECRET`をrequired secret名として宣言し、長いランダム値を環境ごとに登録する。値はリポジトリ、`wrangler.jsonc`、通常のWorker変数へ平文で置かない。未登録のremote環境ではWranglerのversion uploadが失敗する。

```bash
# local: apps/municipality/.env を .env.example から作り、実値へ置換
curl -fsS -X POST \
  -H "Authorization: Bearer $OPEN_DATA_SYNC_SECRET" \
  'http://localhost:3001/internal/open-data/sync?dry_run=true'

# Cloudflare secret（staging/productionで別値を推奨）
pnpm exec wrangler secret put OPEN_DATA_SYNC_SECRET --env staging --config apps/municipality/wrangler.jsonc
pnpm exec wrangler secret put OPEN_DATA_SYNC_SECRET --env production --config apps/municipality/wrangler.jsonc
```

`dry_run=true`は固定元CSVを取得・検証し、現在versionとの差を返すが、Source Registry、dataset、resource、import runを一切変更しない。実反映はqueryなしの同じPOSTを使う。Bearer secretはSHA-256 digest同士を一定長で比較し、不一致内容を応答へ出さない。同期失敗はHTTP 503となり、active datasetは維持される。

自治体Workerだけが`0 3 * * *`（毎日03:00 UTC / 12:00 JST）のCron Triggerを持ち、手動同期と同じ関数を1回呼ぶ。利用者WorkerにCronと同期POSTはない。stagingではmigration・secret登録後、まずdry-run、次に実同期、最後に両Workerの公開GETで`origin=d1`とmetadataを確認する。productionへのmigration・初回同期は既存のproduction変更承認手順に従う。

### staging同期・Cron確認

既定Worker名を使う場合はstaging URLを次のように組み立てる。repository variableでWorker名を上書きしている場合は、その実名へ置き換える。

```bash
USER_STAGING_URL="https://staybridge-user-staging.${CLOUDFLARE_WORKERS_SUBDOMAIN}.workers.dev"
MUNICIPALITY_STAGING_URL="https://staybridge-municipality-staging.${CLOUDFLARE_WORKERS_SUBDOMAIN}.workers.dev"
OPEN_DATA_QUERY='municipality=Kita&category=emergency_shelter'

curl -fsS "${USER_STAGING_URL}/api/open-data/resources?${OPEN_DATA_QUERY}" |
  jq '{origin: .data.origin, version: .data.datasetVersion, count: (.data.resources | length)}'
curl -fsS "${MUNICIPALITY_STAGING_URL}/api/open-data/resources?${OPEN_DATA_QUERY}" |
  jq '{origin: .data.origin, version: .data.datasetVersion, count: (.data.resources | length)}'

# 検証のみ。D1のSource Registry、version、resource、import runを変更しない。
curl -fsS -X POST -H "Authorization: Bearer ${OPEN_DATA_SYNC_SECRET}" \
  "${MUNICIPALITY_STAGING_URL}/internal/open-data/sync?dry_run=true" |
  jq -e '.data.dryRun == true and .data.rowCount >= 50'

# 実同期。成功後は両Workerで同じD1 active versionを確認する。
curl -fsS -X POST -H "Authorization: Bearer ${OPEN_DATA_SYNC_SECRET}" \
  "${MUNICIPALITY_STAGING_URL}/internal/open-data/sync" |
  jq -e '.data.dryRun == false and (.data.status == "activated" or .data.status == "not_modified")'
curl -fsS "${USER_STAGING_URL}/api/open-data/resources?${OPEN_DATA_QUERY}" |
  jq -e '.data.origin == "d1" and (.data.resources | length) >= 50'
curl -fsS "${MUNICIPALITY_STAGING_URL}/api/open-data/resources?${OPEN_DATA_QUERY}" |
  jq -e '.data.origin == "d1" and (.data.resources | length) >= 50'
```

Versions upload方式ではCron Triggerを別途反映する。自治体stagingだけに適用し、利用者Workerへは実行しない。

```bash
pnpm exec wrangler triggers deploy \
  --env staging --config apps/municipality/wrangler.jsonc
```

build済みWorkerのscheduled wiringは、vinextが生成する`dist/server/index.js`を直接importするrendered contractで確認する。このコマンドは先に自治体Workerをbuildし、生成物に`scheduled()`と保護されたsync routeが存在することを実行時assertする。source側の`wrangler.jsonc`を直接`wrangler dev`へ渡すとvinext virtual importを解決できないため、scheduled確認には使わない。

```bash
OPEN_DATA_SYNC_SECRET=local-contract-only \
  pnpm --filter @staybridge/municipality test:rendered
```

scheduled handlerが呼ぶ実同期関数は、上記stagingの認証付き実同期POSTで即時確認する。Cron固有のremote実行確認は、Trigger反映後の`open_data_import_runs`を使う。

remoteではTrigger反映後、次回実行以降の`open_data_import_runs`をstaging D1で確認する。`status`が`succeeded`または`not_modified`で、`started_at`がCron時刻以降ならscheduled同期確認済みとする。失敗時はactive pointerが変わっていないことも公開GETで確認する。

```bash
pnpm exec wrangler d1 execute STAYBRIDGE_DB \
  --remote --config .wrangler/d1/staging.json --json \
  --command "SELECT started_at, finished_at, status, version_hash, row_count, error_code FROM open_data_import_runs ORDER BY started_at DESC LIMIT 5"
```
