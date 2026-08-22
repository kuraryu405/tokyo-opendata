import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/assign-pr-people.yml",
  import.meta.url,
);

const workflow = await readFile(workflowUrl, "utf8");

function extractGithubScript(source) {
  const marker = "          script: |\n";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, "github-script block should exist");

  const lines = source.slice(start + marker.length).split("\n");
  const scriptLines = [];

  for (const line of lines) {
    if (line !== "" && !line.startsWith("            ")) {
      break;
    }

    scriptLines.push(line.slice(12));
  }

  return scriptLines.join("\n");
}

function createGithubMock({ contributors, requestedUsers = [], reviews = [] }) {
  const calls = {
    addAssignees: [],
    requestReviewers: [],
  };

  const listContributors = async () => ({ data: contributors });
  const listReviews = async () => ({ data: reviews });

  return {
    calls,
    github: {
      paginate: async (method) => {
        if (method === listContributors) {
          return contributors;
        }

        if (method === listReviews) {
          return reviews;
        }

        throw new Error("Unexpected paginated method");
      },
      rest: {
        issues: {
          addAssignees: async (parameters) => {
            calls.addAssignees.push(parameters);
          },
        },
        pulls: {
          listRequestedReviewers: async () => ({
            data: { users: requestedUsers, teams: [] },
          }),
          listReviews,
          requestReviewers: async (parameters) => {
            calls.requestReviewers.push(parameters);
          },
        },
        repos: {
          listContributors,
        },
      },
    },
  };
}

async function runWorkflowScript({
  action = "ready_for_review",
  assignees = [],
  contributors,
  requestedUsers,
  reviews,
}) {
  const { calls, github } = createGithubMock({
    contributors,
    requestedUsers,
    reviews,
  });
  const logs = [];
  const context = {
    payload: {
      action,
      pull_request: {
        number: 38,
        draft: false,
        head: { repo: { fork: true } },
        user: { login: "author" },
        assignees,
      },
    },
    repo: { owner: "example", repo: "staybridge" },
  };
  const core = { info: (message) => logs.push(message) };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction(
    "github",
    "context",
    "core",
    extractGithubScript(workflow),
  );

  await execute(github, context, core);

  return { calls, logs };
}

test("draft PRs wait until ready_for_review before assignment runs", () => {
  assert.match(
    workflow,
    /types: \[opened, reopened, ready_for_review\]/,
  );
  assert.match(
    workflow,
    /if: github\.event\.pull_request\.draft == false/,
  );
  assert.doesNotMatch(workflow, /actions\/checkout/);
});

test("ready fork PR assigns the author and requests only a new reviewer", async () => {
  const { calls } = await runWorkflowScript({
    contributors: [
      { login: "author", type: "User" },
      { login: "already-requested", type: "User" },
      { login: "already-reviewed", type: "User" },
      { login: "new-reviewer", type: "User" },
      { login: "automation", type: "Bot" },
    ],
    requestedUsers: [{ login: "already-requested" }],
    reviews: [{ user: { login: "already-reviewed" } }],
  });

  assert.equal(calls.addAssignees.length, 1);
  assert.deepEqual(calls.addAssignees[0].assignees, ["author"]);
  assert.equal(calls.requestReviewers.length, 1);
  assert.deepEqual(calls.requestReviewers[0].reviewers, ["new-reviewer"]);
});

test("ready PR still assigns the author when no new reviewer is available", async () => {
  const { calls, logs } = await runWorkflowScript({
    contributors: [
      { login: "author", type: "User" },
      { login: "automation", type: "Bot" },
    ],
  });

  assert.equal(calls.addAssignees.length, 1);
  assert.deepEqual(calls.addAssignees[0].assignees, ["author"]);
  assert.equal(calls.requestReviewers.length, 0);
  assert.ok(
    logs.some((message) => message.includes("No new contributors")),
  );
});

test("reruns do not reassign the author or notify previous reviewers", async () => {
  const { calls, logs } = await runWorkflowScript({
    action: "reopened",
    assignees: [{ login: "author" }],
    contributors: [
      { login: "author", type: "User" },
      { login: "already-requested", type: "User" },
      { login: "already-reviewed", type: "User" },
    ],
    requestedUsers: [{ login: "already-requested" }],
    reviews: [{ user: { login: "already-reviewed" } }],
  });

  assert.equal(calls.addAssignees.length, 0);
  assert.equal(calls.requestReviewers.length, 0);
  assert.ok(logs.some((message) => message.includes("already assigned")));
  assert.ok(
    logs.some((message) => message.includes("No new contributors")),
  );
});
