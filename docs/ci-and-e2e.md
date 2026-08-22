# CI, CD, and external E2E

## CI and release gates

Every pull request and push to `main` runs the **CI** workflow with a frozen
pnpm lockfile. CI runs lint, TypeScript checks, all tests, and explicit builds
for both `apps/user` and `apps/municipality`. Pull requests never have access to
the release workflow and never deploy.

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
and applies the `workers.dev` trigger. Staging `/healthz` must report the target
service and commit SHA before production starts. Production does the same. If
production health fails, the workflow rolls back to the version that was active
before release when one exists, verifies that version is active, and fails.
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

Set `CLOUDFLARE_WORKERS_SUBDOMAIN` to derive all four `workers.dev` URLs. An
explicit URL can instead be supplied with `USER_STAGING_URL`,
`USER_PRODUCTION_URL`, `MUNICIPALITY_STAGING_URL`, and
`MUNICIPALITY_PRODUCTION_URL`. Explicit URLs take precedence. The immutable
`APP_REVISION` value is derived from the successful CI commit and is installed
as a plain Worker variable during Version upload.

The build uses production URLs for canonical metadata and cross-application
links so that the exact same artifact can be promoted through staging. Staging
therefore tests production-link configuration as part of the release candidate.

## External Playwright contract

External E2E dispatch is a post-production gate. It is not started after CI or
staging. A failed external suite marks the release workflow failed for
visibility, but cannot trigger the Worker rollback path after production health
has succeeded.

The release calls the public reusable workflow
`kuraryu405/StayBridgeTokyo-e2e/.github/workflows/acceptance.yml@main`
directly. It passes:

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
