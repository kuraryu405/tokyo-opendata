# CI, CD, and external E2E

## CI and release gates

Every pull request and push to `main` runs the **CI** workflow with a frozen
pnpm lockfile. CI runs lint, TypeScript checks, all tests, and explicit builds
for both `apps/user` and `apps/municipality`. Pull requests never have access to
the release workflow and never deploy.

## GitHub Actions supply-chain policy

Every remote `uses:` reference in `.github/workflows` is pinned to a full
40-character commit SHA. GitHub Actions include the release tag as a same-line
comment. The external E2E reusable workflow has no release tags, so its comment
records the source branch and the shortened pinned SHA instead.

Dependabot checks the `github-actions` ecosystem weekly. For every update pull
request, verify that the proposed commit belongs to its source repository and
that its comment identifies the matching release or reusable-workflow revision
before merging. `pnpm run test:workflows` rejects mutable action references and
missing version comments.

The workflow permission and secret boundaries are:

| Workflow | Repository token permissions | Additional secret | Boundary |
| --- | --- | --- | --- |
| CI | `contents: read` | None | Checks out and tests pull-request code without persisted credentials. |
| Assign PR author and reviewers | `contents: read`, `issues: write`, `pull-requests: write` | None | Uses `pull_request_target`; never checks out or executes pull-request code. |
| Recognize contributors | `contents: read` | `CONTRIBUTOR_AUTOMATION_TOKEN` | Runs only after a non-bot pull request is merged and opens a reviewable follow-up pull request. |
| Release Workers | `actions: read`, `contents: read` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Runs only after successful CI on `main`, detects release scope, and passes deployment secrets only to the reusable deployment jobs. |
| Deploy one Worker phase | `contents: read` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Builds each app once for staging, reuses that artifact for gated production promotion, and recovers failed production health checks. |
| External E2E | Inherited from Release Workers | None | Runs against the coherent staging pair and must pass before any affected production Worker is promoted. |

## Pull request assignment and review requests

The **Assign PR author and reviewers** workflow processes a ready pull request's
author assignment before it discovers reviewer candidates. An unassignable
author is reported as a warning, while reviewer processing continues. Reviewer
discovery is a separate best-effort step, so a temporary discovery failure
cannot prevent the assignment attempt.

Individual reviewer candidates come from the repository collaborators API with
the `push` permission filter. The workflow also verifies each returned user's
`permissions.push` value, then excludes the pull request author, bots, current
review requests, and users who have already reviewed. It limits the total to
three trusted individual participants across prior requests, prior reviews, and
new requests, trying candidates in login order until that limit is reached. An
existing team review request suppresses additional individual requests.

Each individual review request is isolated. If a collaborator loses permission
between discovery and the request, the workflow records a warning and continues
with the remaining candidates. Reopened pull requests and reruns reuse the
existing assignee and review history to avoid duplicate notifications. The
workflow uses `pull_request_target` but never checks out or executes pull-request
code.

## Release range and deployment

After a successful push CI on `main`, CI records the push event's exact
`before` and `head` SHAs as a small release-range artifact. **Release Workers**
downloads that artifact from the successful CI run and compares the complete
push range, including pushes that contain more than one commit:

- a change under `apps/user/` promotes only the user Worker to production;
- a change under `apps/municipality/` promotes only the municipality Worker to production;
- a shared package, root file, workflow, or documentation change releases both.

Whenever either app is affected, both apps are built from the same release SHA,
deployed to staging, and tested as one cross-app release candidate. Each
staging-phase reusable job builds once without a public environment URL and uploads
`staybridge-<service>-<full SHA>` as an Actions artifact. The tarball includes
the generated `dist/server/wrangler.json`, `dist/client`, and the Sites metadata
under `dist/.openai`. After external acceptance succeeds, only the apps detected
as affected are promoted. Their production-phase jobs download the same tarball
from the release run and check its SHA-256 before use.

Wrangler 4.92.0 uploads a tagged Worker Version with the target environment's
`COUNTERPART_APP_URL`, deploys it to 100% traffic,
and applies the `workers.dev` trigger. The workflow injects only the target
environment's D1 ID into the verified artifact configuration and does not run a
migration. Public metadata is derived from the incoming request origin. The
browser-facing `/crisis` and `/user` links stay origin-relative until the Worker
resolves them through the injected counterpart URL, so staging links stay in
staging and production links stay in production while both use the same build
artifact. Both staging `/healthz` endpoints must report the target service and
commit SHA and both `/readyz` endpoints must confirm the D1 Binding before
external Playwright starts. No production promotion job can start unless that
cross-app acceptance job succeeds. Production performs the same bounded liveness
and readiness checks. If production liveness or readiness fails, the workflow rolls back to
the version that was active before release when one exists, verifies that
version is active, verifies its liveness/readiness again, and fails. Automatic
promotion refuses to start when a production Worker has no prior rollback
version. The first production deployment is therefore an explicit operator
bootstrap performed only after staging acceptance has been reviewed; this
prevents the automated path from activating an initial revision it cannot roll
back.
There is no pull-request preview or custom-domain setup in this pipeline.

The complete staging-to-production release is serialized across revisions, so a
newer staging deployment cannot replace the targets while an older revision's
external acceptance is still running. A running release is never cancelled by a
newer commit.

## Repository configuration

Cloudflare deployment uses exactly these two GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN`: token limited to Workers Scripts edit and the account
  resources needed by the generated Worker configuration;
- `CLOUDFLARE_ACCOUNT_ID`: the target Cloudflare account ID.

The default Worker names are:

- `staybridge-user-staging`
- `staybridge-user-production`
- `staybridge-municipality-staging`
- `staybridge-municipality-production`

They can be overridden with repository variables named
`USER_STAGING_WORKER`, `USER_PRODUCTION_WORKER`,
`MUNICIPALITY_STAGING_WORKER`, and `MUNICIPALITY_PRODUCTION_WORKER`.

The repository variable `CLOUDFLARE_WORKERS_SUBDOMAIN` is required. Release
configuration fails before any build or deployment when it is missing or
empty. The workflow derives each verification URL as
`https://<worker>.<subdomain>.workers.dev`; verification URLs do not fall back
to localhost or an unrelated custom domain. The immutable `APP_REVISION` value
is derived from the successful CI commit and is installed as a plain Worker
variable during Version upload.

The repository variables `STAYBRIDGE_STAGING_D1_DATABASE_ID` and
`STAYBRIDGE_PRODUCTION_D1_DATABASE_ID` are also required. They must contain
different, non-placeholder D1 IDs. They are runtime configuration rather than
secrets; the workflow does not print them. Database creation and migration are
separate operator procedures documented in
[Workers・D1バックエンド基盤](backend-d1.md).

自治体Workerの `OPEN_DATA_SYNC_SECRET` はrequired Worker secretとしてstaging/productionへ別々に登録する。値はrepository secretやbuild artifactへ入れない。Open Data migration後は認証付きdry-runが既存12 identityを全件検証した場合だけ実同期し、両Workerの公開GETをstaging確認する。Cron自動同期はIssue #61の対象外である。

The reusable workflow receives an explicit staging or production phase, the app directory, Worker names, GitHub
Environment names, the staging and production site/counterpart URL matrix, and
the revision as non-secret inputs. It rejects identical staging/production URLs
and injects the appropriate counterpart URL only while uploading each Worker
Version. No staging or production origin is embedded during the one-time build.
This makes a staging browser acceptance journey remain entirely on staging
origins without weakening exact-artifact promotion.

### main branch protection

`main` has classic branch protection with a required CI check and history
controls. This documents the settings that are actually enabled; it does not
claim that GitHub enforces human review or a pull-request-only path:

- Required status check: the CI workflow's `Validate monorepo` context, with
  "require branches to be up to date before merging" enabled (`strict`).
- Enforcement applies to administrators (`enforce_admins` enabled), so the
  required check is not exempted for the repository owner.
- Linear history is required; force pushes and branch deletions are denied.
- Required pull-request reviews are not configured. GitHub therefore does not
  enforce an approval count or a PR-only path for this solo-maintainer setup;
  PR review remains an operating practice, not a protected-branch guarantee.

Applied on 2026-08-24 via the branches/protection API. Requiring review
approvals is deliberately avoided for this solo-maintainer repository because
it would deadlock merges. In an emergency, temporarily relax these settings in
GitHub repository settings only, then record here what changed, why, and why
the affected release had to re-run before restoring full protection.

Release SHA provenance: **Release Workers** triggers through `workflow_run`
only on a successful CI run for a push to `main`, and deploys exactly that
run's recorded SHA. It therefore promotes only commits reachable from
protected `main`; pull-request or fork code can never reach production.

## External Playwright contract

External E2E is the production-promotion gate. The release always deploys both
apps from the exact CI revision to staging, verifies their health/readiness, and
then runs the external suite against the two staging origins. A failed suite
ends the release before either affected production Worker is touched. This makes
the rollback unit for a cross-app acceptance failure the whole candidate: there
is nothing to roll back in production.

The release calls the public reusable workflow
`kuraryu405/StayBridgeTokyo-e2e/.github/workflows/acceptance.yml` at its
pinned `main` revision directly. It passes:

- `target_commit`: the exact application revision;
- `user_url` and `municipality_url`: the coherent staging targets;
- `evidence_mode`: whether to capture the optional evidence journeys.

The reusable job remains part of the release run, so its result is visible
without dispatch polling or an extra repository credential. Merge the E2E
workflow-call contract before enabling the application release workflow.
Cloudflare deployment therefore uses the only two repository secrets listed
above; no E2E secret is required.

The receiving `acceptance.yml` accepts the same values through
`workflow_call`. It may keep `workflow_dispatch` and `repository_dispatch` for
operator reruns and backwards compatibility; those paths are separate from the
automated release contract.

### QUESTION 03 AI補助分類のブラウザ確認

Issue #56の利用者向け変更は、実際の公開URLでPC幅と390px幅を確認する。外部E2Eでは `ja` / `en` / `my` を対象に、QUESTION 01・02・03・07で「その他」を選ぶと対応するtextarea、文字数上限、個人情報を入力しない案内が表示され、空白だけでは「次へ」が押せないことを実クリックで検証する。各回答は相談サマリーにも表示されることを確認する。

`POST /api/recommend-actions` はブラウザ側でinterceptし、bodyがQUESTION 03のtrim済み文字列だけを含む `{ "text": "..." }` で、他の3項目を含まないことを検証する。有効なallowlist IDを返した場合はRule Engineのカードを残したままAI由来カードが重複なく追加されること、502・不正JSON・allowlist外ID・8秒超の応答ではRule Engineだけで完了することを確認する。応答待ちに戻る、QUESTION 03を書き換える、再読込する、最初からやり直す各操作では、古い応答や保存済み派生IDが復活しないことも確認する。

The promotion matrix is explicit: a user-only change stages both apps and then
promotes only user; a municipality-only change stages both and promotes only
municipality; a shared change stages and promotes both. The unchanged staging
counterpart is intentionally refreshed to the same SHA so cross-app navigation
is tested without mixing revisions.

## Local verification without deployment

Run the normal checks and build both apps. The generated configuration can be
packaged without network mutation with Wrangler's dry-run command:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build:user
pnpm build:municipality
node scripts/cd/validate-dist.mjs apps/user
node scripts/cd/validate-dist.mjs apps/municipality
pnpm exec wrangler versions upload --config apps/user/dist/server/wrangler.json --name staybridge-user-staging --var APP_REVISION:local-dry-run --dry-run
```

## Contributor recognition

When a non-bot pull request is merged, **Recognize contributors** opens a
follow-up pull request that adds its author to the All Contributors list. Add
`CONTRIBUTOR_AUTOMATION_TOKEN` as a fine-grained token scoped to this repository
with **Contents: read and write** and **Pull requests: read and write**. This
separate automation credential is unrelated to Worker deployment.
