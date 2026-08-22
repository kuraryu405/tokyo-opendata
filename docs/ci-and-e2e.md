# CI and E2E

Every pull request and push to `main` runs `pnpm lint`, `pnpm typecheck`, and `pnpm test` through the **CI** workflow.

## GitHub Actions supply-chain policy

Every third-party `uses:` reference in `.github/workflows` is pinned to a full
40-character commit SHA. Keep the release tag on the same line as a comment so
reviewers and Dependabot can show which release the SHA represents.

Dependabot checks the `github-actions` ecosystem weekly. For every update pull
request, verify that the proposed commit belongs to the action's official
repository and that the version comment matches a release tag before merging.
`pnpm run test:workflows` rejects mutable action references and missing version
comments.

The workflow permission and secret boundaries are:

| Workflow | Repository token permissions | Additional secret | Boundary |
| --- | --- | --- | --- |
| CI | `contents: read` | None | Checks out and tests pull-request code without persisted credentials. |
| Assign PR author and reviewers | `contents: read`, `issues: write`, `pull-requests: write` | None | Uses `pull_request_target`; never checks out or executes pull-request code. |
| Recognize contributors | `contents: read` | `CONTRIBUTOR_AUTOMATION_TOKEN` | Runs only after a non-bot pull request is merged and opens a reviewable follow-up pull request. |
| Deploy | `contents: read` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Runs from `main` or by manual dispatch; secrets are scoped to the deploy step. |
| Dispatch E2E | `contents: read` | `E2E_REPOSITORY_DISPATCH_TOKEN` | Sends a fixed metadata payload and never includes the token in it. |

## Pull request assignment and review requests

The **Assign PR author and reviewers** workflow processes a ready pull request's
author assignment before it discovers reviewer candidates. An unassignable
author is reported as a warning, while reviewer processing continues. Reviewer
discovery is a separate best-effort step, so a temporary discovery failure
cannot prevent the assignment attempt.

Individual reviewer candidates come from the repository collaborators API with
the `push` permission filter. The workflow also verifies each returned user's
`permissions.push` value, then excludes the pull request author, bots, current
review requests, and users who have already reviewed. It requests at most three
individual reviewers, trying candidates in login order until three requests
succeed. An existing team review request suppresses additional individual
requests.

Each individual review request is isolated. If a collaborator loses permission
between discovery and the request, the workflow records a warning and continues
with the remaining candidates. Reopened pull requests and reruns reuse the
existing assignee and review history to avoid duplicate notifications. The
workflow uses `pull_request_target` but never checks out or executes pull-request
code.

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
