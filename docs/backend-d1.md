# Workers・D1 バックエンド基盤

利用者アプリと自治体アプリは、独立 API Worker を追加せず、それぞれの既存 Worker から同じ D1 を参照します。Binding 名は `STAYBRIDGE_DB`、型は `BackendEnv` で一元化しています。

## 環境分離

| 環境 | データベース名 | 接続方法 |
| --- | --- | --- |
| local | `staybridge-local` | ローカル Miniflare。常に既定 |
| staging | `staybridge-staging` | 明示的な remote 設定だけ |
| production | `staybridge-production` | 明示的な remote 設定と変更承認が必要 |

`apps/*/wrangler.jsonc` の ID は失敗安全な placeholder です。ローカル Binding には `remote: false` があり、`pnpm dev` や `db:local:*` は Cloudflare 上の D1 を参照しません。CD は GitHub repository variables `STAYBRIDGE_STAGING_D1_DATABASE_ID` と `STAYBRIDGE_PRODUCTION_D1_DATABASE_ID` をデプロイ直前の成果物へ注入し、未設定、placeholder、同一 ID を拒否します。さらに、認証済みの D1 一覧で各 ID がそれぞれ `staybridge-staging` と `staybridge-production` に一意に対応することをビルド前に確認します。実 ID をリポジトリへ記録する必要はありません。

`compatibility_date` は Wrangler 4.92.0 に同梱された workerd が対応する `2026-05-15` です。

## ローカル初期化と確認

初期化は migration の後に seed を実行します。migration は `database/migrations`、seed は `database/seed.sql` が正本です。seed は同じ内容を繰り返し適用できます。

```bash
pnpm db:local:init
pnpm db:local:status
pnpm db:local:verify
pnpm dev
```

`db:local:status` が `No migrations to apply`、`db:local:verify` が `seed_version = 2` を返せば初期化済みです。完全に空の DB で検証するときは、別の一時ディレクトリを `--persist-to` に指定して `db:local:migrate` と同じ Wrangler コマンドを実行してください。`.wrangler/` は Git 管理外です。

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
- `GET /readyz`: D1の各service契約について、必要テーブルごとに副作用のない `PRAGMA table_info(...)`、`PRAGMA index_list/index_info`、`PRAGMA foreign_key_list(...)` を実行し、migrationが要求する必須column・UNIQUE・FKまで検査してreadinessを判定します。両WorkerはOpen Dataのsource・version・resource・active pointer・import runテーブルを要求します。利用者 Worker はさらに `backend_metadata`・`situation_submissions`・`conversations`・`conversation_messages`、自治体 Worker は `backend_metadata`・`situation_submissions` を要求します。migration前の空DBや一部だけ適用されたDBはreadinessにならず、Binding欠落も同様に未準備として扱います。`seed_version`は判定に含めません（seed未適用でもruntimeは動作するため）。不足時は503 `SERVICE_UNAVAILABLE`を返し、テーブル名・column名・constraint名・SQLなどの内部詳細は返しません。
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

### 自治体 Crisis View の匿名集計API

自治体Workerだけが `GET /api/crisis/needs?municipality=13117&period=30d&view=needs` を提供する。利用可能な値は固定で、`municipality=13117`、`period=7d|30d|90d`、`view=needs|return_status|departure_window|accommodation` の各1個だけである。未知・重複・欠落・自由形式のquery parameterとGET以外は拒否する。利用者Worker、個票取得API、会話の一覧・集計APIは追加しない。

対象は同意済み`situation_submissions`だけである。`needs`は`json_each(needs_json)`と`COUNT(DISTINCT situation_submissions.id)`で集計し、他viewはコード内固定のenum columnを使う。request文字列はSQLへ補間しない。全体またはカテゴリが5件未満なら正確な数を返さず、`availability`を`no_data` / `below_threshold` / `available`で返す。`available`の場合だけ回答者数と、個人時刻を避けた最終集計日のJST日付を返す。D1障害は内部情報なしの503 `SERVICE_UNAVAILABLE`である。

期間は`Asia/Tokyo`の暦日で、当日を含む直近7/30/90日の00:00 JSTから現在までとする。D1にはUTC ISO 8601 textで保存されるため、query bindはそのJST境界と同じUTC時刻を使う。最終集計日が直近7東京暦日にない場合は`freshness=stale`、それ以外は`fresh`である。レスポンスは常にthreshold、coverage note、非推定のlimitationsを含める。匿名集計は任意回答の観測範囲に限られ、人口・不足・優先度・サービス提供能力を示さない。

Situation POSTは`application/json`、48,000 byte以下を必須とし、同一origin、1分20回のCloudflare Rate Limit、payloadとtokenを含むhashでのidempotencyを検証します。同じidempotency keyを別payloadへ再利用すると409です。会話のserver-internal境界は20件以下・1件2,000文字以下、role交互、source ID 12件以下に制限します。Rate Limitのkeyには接続IPを利用しますがD1へ保存せず、Cookieや恒久ユーザーIDを発行しません。

`situation_submissions`、`conversations`、`conversation_messages`は分離し、未マスキング本文やraw requestは保存しません。削除コード・idempotency keyはSHA-256 hashだけをD1へ保存します。`expires_at`と期限削除jobは持たず、検査通過後の同意済みデータは無期限保持です。保存・削除APIは回答本文やD1例外をログ出力せず、失敗時は一般化したエラーだけを返します。

## Open Data同期と公開API

`0003_open_data_cache.sql` は既存4 Source Registry metadata、`KITA_LOCAL_FACILITIES` version、正規化resource、active pointer、import runを保存し、raw CSV/ZIPを保存しません。同期は `固定2 URLをfetch → 既存12 identityを全件validate/normalize → stage → CAS付きtransactional active switch` の順です。学校・標準ZIPのraw bytesを境界付きで連結したSHA-256をversionとし、同一inputの再実行でversion/resourceを増やしません。active pointerを同期開始後に他runが更新していた場合はstale runを失敗させ、新しいactiveへ戻しません。

両Workerが次のread-only APIを提供します。

```text
GET /api/open-data/resources?municipality=Kita
GET /api/open-data/resources?municipality=Kita&category=medical
```

`municipality=Kita` は必須、`category` は省略するか `school`、`medical`、`child_support`、`public_facility` の1個だけです。応答には `datasetKey`、`datasetVersion`、`sourceUpdatedAt`、`fetchedAt`、`origin`、source ID・出典・更新日・取得日・ライセンス・attribution・更新頻度・coverage noteの `sources`、`resources` が含まれます。D1 activeがexact 12 identityで完全なら `origin=d1`、activeがない、D1 readが失敗する、metadata・件数・正規化行が不正な場合は既存の同梱8件last-known-goodを `origin=bundled` で返します。同梱cacheで検証できない学校は0件です。公開GETから外部sourceを取得しません。

手動同期は自治体Workerだけの `POST /internal/open-data/sync` です。`OPEN_DATA_SYNC_SECRET` をrequired secretとして環境ごとに登録し、値をrepository、Wrangler設定、通常変数へ置きません。ローカルは `apps/municipality/.env.example` を `.env` へコピーし、実値に置き換えます。

```bash
# local: 検証だけ
curl -fsS -X POST \
  -H "Authorization: Bearer ${OPEN_DATA_SYNC_SECRET}" \
  'http://localhost:3001/internal/open-data/sync?dry_run=true'

# remote: 自動deployより前に環境別secretを登録
pnpm exec wrangler secret put OPEN_DATA_SYNC_SECRET \
  --env staging --config apps/municipality/wrangler.jsonc
pnpm exec wrangler secret put OPEN_DATA_SYNC_SECRET \
  --env production --config apps/municipality/wrangler.jsonc
```

`dry_run=true` は固定元CSV/ZIPを取得・全件検証し、active versionとの差を返しますが、Source Registry、dataset、resource、import runを変更しません。queryなしのPOSTが実反映です。現在の学校CSVがcurrent identity/address contractを満たさない間は503が正しい結果で、active datasetまたは同梱cacheを維持します。12 identityが全件そろい、各source更新日がactiveより後退していない場合だけ実同期でactiveを切り替えます。Cron Triggerは本Issueでは追加せず、同期はこの認証付き手動routeだけです。

stagingではmigration・seed・secret登録後に次の順で確認します。Worker名を上書きしている場合はURLを実名へ置き換えます。

```bash
USER_STAGING_URL="https://staybridge-user-staging.${CLOUDFLARE_WORKERS_SUBDOMAIN}.workers.dev"
MUNICIPALITY_STAGING_URL="https://staybridge-municipality-staging.${CLOUDFLARE_WORKERS_SUBDOMAIN}.workers.dev"
OPEN_DATA_QUERY='municipality=Kita'

curl -fsS -X POST -H "Authorization: Bearer ${OPEN_DATA_SYNC_SECRET}" \
  "${MUNICIPALITY_STAGING_URL}/internal/open-data/sync?dry_run=true" |
  jq -e '.data.dryRun == true and .data.rowCount == 12'
curl -fsS -X POST -H "Authorization: Bearer ${OPEN_DATA_SYNC_SECRET}" \
  "${MUNICIPALITY_STAGING_URL}/internal/open-data/sync" |
  jq -e '.data.dryRun == false and (.data.status == "activated" or .data.status == "not_modified")'
curl -fsS "${USER_STAGING_URL}/api/open-data/resources?${OPEN_DATA_QUERY}" |
  jq -e '.data.origin == "d1" and (.data.resources | length) == 12'
curl -fsS "${MUNICIPALITY_STAGING_URL}/api/open-data/resources?${OPEN_DATA_QUERY}" |
  jq -e '.data.origin == "d1" and (.data.resources | length) == 12'
```

学校sourceのdriftによりdry-runが503の場合は実同期を行わず、公開GETが `origin=d1` の既存activeまたは `origin=bundled` の8件cacheを返すことを確認します。source修正後にdry-runが12件で成功した場合だけ実同期と両Worker GETを確認します。import履歴は `SELECT started_at, finished_at, status, version_hash, row_count, error_code FROM open_data_import_runs ORDER BY started_at DESC LIMIT 5` で確認できます。production migration、seed、secret登録、初回手動同期は既存のproduction変更承認手順に従います。

staging/production の smoke test は liveness と readiness の両方を確認します。readiness が 503 の場合は、対象環境の Worker Binding が `STAYBRIDGE_DB` か、DB ID が対象環境のものか、D1 が利用可能かを Cloudflare 側で確認します。レスポンスに内部詳細を追加して調査しないでください。
