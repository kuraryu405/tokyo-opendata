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
| Deploy one Worker | `contents: read` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Builds once, promotes the verified artifact through staging and production, and rolls back failed production health checks. |
| External E2E | Inherited from Release Workers | None | Runs only after the affected production deployments succeed; it cannot roll back a healthy release. |

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

- a change under `apps/user/` releases only the user Worker;
- a change under `apps/municipality/` releases only the municipality Worker;
- a shared package, root file, workflow, or documentation change releases both.

For each affected app, the reusable workflow builds once and uploads
`staybridge-<service>-<full SHA>` as an Actions artifact. The tarball includes
the generated `dist/server/wrangler.json`, `dist/client`, and the Sites metadata
under `dist/.openai`. Staging and production download the same tarball and check
its SHA-256 before use.

Wrangler 4.92.0 uploads a tagged Worker Version, deploys it to 100% traffic,
and applies the `workers.dev` trigger. The workflow injects only the target
environment's D1 ID into the verified artifact configuration; it does not run a
migration. Staging `/healthz` must report the target service and commit SHA and
`/readyz` must confirm the D1 Binding before production starts. Production does
the same. If production liveness or readiness fails, the workflow rolls back to
the version that was active before release when one exists, verifies that
version is active, and fails.
There is no pull-request preview or custom-domain setup in this pipeline.

Production releases are serialized per service and a running release is never
cancelled by a newer commit.

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

The reusable workflow receives the app directory, Worker names, GitHub
Environment names, verification URLs, and revision as non-secret inputs. The
build uses production URLs for canonical metadata and cross-application links
so that the exact same artifact can be promoted through staging. Staging
therefore tests production-link configuration as part of the release candidate.

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

External E2E dispatch is a post-production gate. It is not started after CI or
staging. A failed external suite marks the release workflow failed for
visibility, but cannot trigger the Worker rollback path after production health
has succeeded.

The release calls the public reusable workflow
`kuraryu405/StayBridgeTokyo-e2e/.github/workflows/acceptance.yml` at its
pinned `main` revision directly. It passes:

- `target_commit`: the exact application revision;
- `user_url` and `municipality_url`: the production targets;
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
