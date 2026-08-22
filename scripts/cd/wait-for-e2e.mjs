import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const apiVersion = "2022-11-28";

export function selectDispatchedRun(runs, applicationRef, dispatchedAt) {
  const earliest = new Date(dispatchedAt).getTime() - 5000;
  return runs
    .filter(
      (run) =>
        run.event === "repository_dispatch" &&
        new Date(run.created_at).getTime() >= earliest &&
        run.display_title?.includes(applicationRef),
    )
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )[0];
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": apiVersion,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned HTTP ${response.status}`);
  }
  return response.json();
}

export async function waitForE2E({
  repository,
  workflow,
  applicationRef,
  dispatchedAt,
  token,
  timeoutMs = 45 * 60 * 1000,
  pollMs = 10000,
}) {
  const deadline = Date.now() + timeoutMs;
  const workflowPath = encodeURIComponent(workflow);
  let run;

  while (Date.now() < deadline && !run) {
    const listing = await githubJson(
      `https://api.github.com/repos/${repository}/actions/workflows/${workflowPath}/runs?event=repository_dispatch&per_page=20`,
      token,
    );
    run = selectDispatchedRun(listing.workflow_runs ?? [], applicationRef, dispatchedAt);
    if (!run) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, pollMs));
    }
  }

  if (!run) {
    throw new Error(`timed out waiting for E2E run for ${applicationRef}`);
  }

  while (Date.now() < deadline) {
    const current = await githubJson(run.url, token);
    if (current.status === "completed") {
      process.stdout.write(`External E2E result: ${current.html_url}\n`);
      if (current.conclusion !== "success") {
        throw new Error(`external E2E concluded ${current.conclusion}`);
      }
      return current;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, pollMs));
  }

  throw new Error(`timed out waiting for E2E completion for ${applicationRef}`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const [, , repository, workflow, applicationRef, dispatchedAt] = process.argv;
  const token = process.env.GH_TOKEN;
  if (!repository || !workflow || !applicationRef || !dispatchedAt || !token) {
    throw new Error(
      "usage: wait-for-e2e.mjs <repository> <workflow> <application-ref> <dispatched-at>; GH_TOKEN is required",
    );
  }

  await waitForE2E({
    repository,
    workflow,
    applicationRef,
    dispatchedAt,
    token,
    timeoutMs: Number(process.env.E2E_TIMEOUT_MS ?? 45 * 60 * 1000),
    pollMs: Number(process.env.E2E_POLL_MS ?? 10000),
  });
}
