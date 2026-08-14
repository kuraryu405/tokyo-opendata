# CI and E2E

Every pull request and push to `main` runs `pnpm lint`, `pnpm typecheck`, and `pnpm test` through the **CI** workflow.

## Separate Playwright repository

The **Dispatch E2E** workflow starts the external Playwright suite only after CI succeeds on `main`. Configure it once in this repository:

1. Add the repository variable `E2E_REPOSITORY` with the target in `owner/repository` form.
2. Optionally add `E2E_APPLICATION_URL` when E2E should use a fixed deployed URL.
3. Add `E2E_REPOSITORY_DISPATCH_TOKEN` as an Actions secret. Use a fine-grained token with **Contents: read and write** access only to the E2E repository.
4. In the E2E repository, listen for `repository_dispatch` with type `application-updated`. Read `github.event.client_payload.repository`, `.ref`, and `.url` to select the application revision and target URL.

The dispatch payload never contains secrets. A manual run is also available from the Actions tab when a specific application SHA needs retesting.

## Contributor recognition

When a non-bot pull request is merged, the **Recognize contributors** workflow opens a small follow-up pull request that adds its author to the All Contributors list in the README. It preserves the branch-protection rule: the generated pull request is reviewed and merged like every other change.

Before enabling this workflow, add `CONTRIBUTOR_AUTOMATION_TOKEN` as an Actions secret. Use a fine-grained token with **Contents: read and write** and **Pull requests: read and write** access only to this repository. A personal access token is used deliberately: a pull request created with `GITHUB_TOKEN` does not start the normal pull-request workflows.
