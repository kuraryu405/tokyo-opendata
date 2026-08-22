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

Configure:

- `E2E_REPOSITORY` as `owner/repository`;
- optional `E2E_WORKFLOW`, defaulting to `acceptance.yml`;
- `E2E_REPOSITORY_DISPATCH_TOKEN` as a separate fine-grained credential scoped
  only to the E2E repository, with **Contents: read and write** for
  `repository_dispatch` and **Actions: read** for result polling.

The built-in `GITHUB_TOKEN` is deliberately not used because it cannot dispatch
to a sibling repository. The E2E credential is not a Cloudflare deployment
secret and is never sent to either Worker.

The sender emits `repository_dispatch` type `application-updated` with:

```json
{
  "user_url": "https://...",
  "municipality_url": "https://...",
  "application_ref": "<full application commit SHA>",
  "evidence_mode": false
}
```

The receiving `acceptance.yml` must accept that event and include
`application_ref` in `run-name`, for example
`run-name: Acceptance ${{ github.event.client_payload.application_ref }}`. The
sender uses that title to correlate and wait for the exact external run.

The receiving repository may keep its existing manual `workflow_dispatch`
inputs `base_url` and `evidence_mode` for backwards-compatible operator reruns.
That manual path is separate from the automated two-URL release contract.

The sender's **Dispatch E2E** workflow also remains manually runnable. Omitted
URLs default to this repository's production URL variables.

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
