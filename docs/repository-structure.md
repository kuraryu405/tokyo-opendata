# Repository structure

この文書は、StayBridge Tokyo の **現在の main に存在する構成を source of truth として説明する** 開発者向けガイドです。新しい理想構成を定義するものではなく、Issue対応のためだけに既存directoryを移動・renameしません。

## 追跡する主要path

次の一覧はCIで実在確認します。pathを移動・削除する場合は、この文書も同じ変更で更新してください。

<!-- repository-structure-paths:start -->
- `apps/user`
- `apps/municipality`
- `packages/domain`
- `packages/data`
- `packages/i18n`
- `packages/sites-vite-plugin`
- `packages/ui`
- `packages/worker-runtime`
- `packages/data/scripts/fetch-open-data.ts`
- `packages/data/src/normalized`
- `database/migrations`
- `database/seed.sql`
- `docs`
- `scripts/cd`
- `scripts/d1`
- `tests`
- `.github/workflows`
- `.gitignore`
- `pnpm-workspace.yaml`
<!-- repository-structure-paths:end -->

`pnpm-workspace.yaml` が workspace として列挙しているのは `apps/*` と `packages/*` です。repository root の `database/`、`docs/`、`scripts/`、`tests/` は workspace package ではありません。

## Top-level directory

| path | 現在の責務 |
| --- | --- |
| `apps/` | deploy可能なアプリケーション。現在は利用者向け `user` と自治体・支援者向け `municipality` の2つ。 |
| `packages/` | app間で共有するdomain、data、i18n、Worker runtime、UI style、build integration。 |
| `database/` | D1 migrationとlocal seed。runtime DBの実データを置く場所ではない。 |
| `docs/` | product、architecture、data、privacy、CI/CD、運用手順などの開発・監査資料。 |
| `scripts/` | repository-levelの運用script。現在はCD補助、D1検証、contributors補助を配置。 |
| `tests/` | 複数workspaceやGitHub Actions等、単一packageに属さないrepository-level test。 |
| `.github/` | GitHub Actions、Issue/PR automation等のrepository automation。 |

Rootの `package.json` はmonorepo共通commandの入口、`pnpm-workspace.yaml` はworkspace範囲、`pnpm-lock.yaml` は依存解決のlockfileです。

## Appの責務境界

### `apps/user`

利用者向けWeb/Worker surfaceです。Situation Check、Roadmap、Local Action、Human Support、Consultation Summary、AI相談、および利用者側の同意付きpersistence endpointを持ちます。利用者固有のrouting、component、copy wiring、Worker entry point、app固有testはここに置きます。

### `apps/municipality`

自治体・支援者向けWeb/Worker surfaceです。Preparedness / Crisis Viewと、公開集計を読む自治体側APIを持ちます。利用者向けappとは別にbuild/deployされます。

両appで再利用するbusiness rule、data contract、translation catalogue、Worker共通処理をapp間でcopyせず、既存のshared packageの責務に合う場合は `packages/*` を使います。逆に、片方のappだけに属するUI/routing処理を共有化目的だけでpackageへ移動しません。

## Shared package

| package | 現在の責務 |
| --- | --- |
| `@staybridge/domain` | Situationの型、固定Rule Engine、Action Catalog等の純粋なdomain logic。 |
| `@staybridge/data` | Source Registry、Open Data adapter/normalizer、検証済みの同梱cache。 |
| `@staybridge/i18n` | JA / EN / Myanmarを含む表示catalogueとAction copy。 |
| `@staybridge/worker-runtime` | D1 persistence、health/readiness、Crisis aggregate等のWorker共通server logic。 |
| `@staybridge/sites-vite-plugin` | user / municipalityのVinext/Vite共通build integration。 |
| `@staybridge/ui` | 両appで共有するstyle resource。 |

新しいworkspaceを追加する場合は、既存packageでは責務を表現できない共有境界がある場合に限り `apps/<name>` または `packages/<name>` とし、rootの共通 `lint` / `typecheck` / `test` / `build` 契約への参加要否も同じPRで確認します。

## Dataの配置とGit管理

Open Dataのruntime取得は行わず、取得・検証・正規化した結果をappに同梱するのが現在の構成です。

- Source metadataと利用条件は `packages/data/src/sources.ts` に置く。
- 外部データの変換境界は `packages/data/src/adapters/` に置く。
- 再取得処理は `packages/data/scripts/fetch-open-data.ts` に置く。
- `data:fetch` が生成する検証済みcacheは `packages/data/src/normalized/*.json` に置き、レビュー可能な再現データとしてGit管理する。
- `packages/data/src/normalized/*.ts` はcacheを型付きapp dataへ接続するsource codeであり、runtime stateではない。
- 取得元のraw CSV/ZIPをそのままrepositoryへ蓄積する運用にはしない。必要な出典、取得日、coverage、licenseはSource Registry / normalized cache側で追跡する。

tracked cacheを更新するPRでは、生成差分をレビューし、source/adapter testと両appへの影響を確認します。

## Database、Worker、script、test、docs

- D1 schema変更は連番SQLを `database/migrations/` へ追加し、既存migrationを書き換えて過去環境との履歴を失わない。
- local開発用の最小seedは `database/seed.sql`。実利用者dataやproduction dumpをcommitしない。
- app固有Worker entry/configは各 `apps/*` 配下に置く。複数Workerで共通化するserver logicは `packages/worker-runtime` に置く。
- deployment/D1等のrepository operationは `scripts/`、package固有のdata refresh等は該当packageの `scripts/` に置く。
- package/app固有testは対象workspaceの `tests/`、複数workspaceやworkflow契約のtestはroot `tests/` に置く。
- 仕様・運用・architectureの説明は `docs/` に置き、READMEは入口と主要commandに留める。

## Git管理しないもの

現在の `.gitignore` に従い、次をcommitしません。

- dependencies: `node_modules/`
- build output: `.next/`, `.vinext/`, `out/`, `dist/`
- test/build artifacts: `coverage/`, `outputs/`, `work/`, `*.tsbuildinfo`, `next-env.d.ts`
- Cloudflare local/runtime state: `.wrangler/`
- secret/local environment: `.env*`（明示的に許可された `.env.example` を除く）、`*.pem`
- local tool state: `.vercel`, debug log等

秘密情報や実環境credentialを「設定を共有しやすい」という理由でtracked fileへ移しません。共有が必要な環境変数は値そのものではなく、secretを含まない `.env.example` やdocsで名前・用途を説明します。

## 現在の命名慣例

新しい命名規約を追加するのではなく、mainで使われている形に合わせます。

- app/package directoryと通常のmodule/script filenameはlowercaseまたはkebab-case（例: `worker-runtime`, `action-catalog.ts`, `fetch-open-data.ts`）。
- React component fileはPascalCase（例: `StayBridgeApp.tsx`, `SupportChat.tsx`）。
- testは対象に合わせて `*.test.ts`, `*.test.tsx`, `*.test.mjs` を使う。
- workspace package名は既存どおり `@staybridge/<directory-name>` とする。
- D1 migrationは既存の連番prefixを維持する。

既存領域でより具体的な慣例がある場合は、その領域の隣接fileを優先します。大規模renameやformatterによる無関係diffを、構成整理の名目で混ぜません。

## 構成変更時の確認

1. 変更対象がapp固有かshared責務かを隣接コードから確認する。
2. tracked data/cacheか、runtime/build artifactかを区別する。
3. 新しいsecret/local stateがGit管理対象に入っていないことを確認する。
4. この文書のmarker内pathを変更した場合は同じPRで更新する。
5. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:user`, `pnpm build:municipality` を通す。
