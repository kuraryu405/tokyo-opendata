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

function createGithubMock({
  authorAssignable = true,
  assignedAuthors = [{ login: "author" }],
  assignmentError,
  contributors,
  requestedTeams = [],
  requestedUsers = [],
  reviews = [],
}) {
  const calls = {
    addAssignees: [],
    checkUserCanBeAssigned: [],
    listContributors: 0,
    requestReviewers: [],
  };

  const listContributors = async () => ({ data: contributors });
  const listReviews = async () => ({ data: reviews });

  return {
    calls,
    github: {
      request: async (route, parameters) => {
        assert.equal(
          route,
          "GET /repos/{owner}/{repo}/issues/{issue_number}/assignees/{assignee}",
        );
        calls.checkUserCanBeAssigned.push(parameters);

        if (!authorAssignable) {
          throw Object.assign(new Error("Not Found"), { status: 404 });
        }

        return { status: 204 };
      },
      paginate: async (method) => {
        if (method === listContributors) {
          calls.listContributors += 1;
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

            if (assignmentError) {
              throw assignmentError;
            }

            return { data: { assignees: assignedAuthors } };
          },
        },
        pulls: {
          listRequestedReviewers: async () => ({
            data: { users: requestedUsers, teams: requestedTeams },
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
  authorAssignable,
  assignedAuthors,
  assignmentError,
  contributors,
  requestedTeams,
  requestedUsers,
  reviews,
}) {
  const { calls, github } = createGithubMock({
    authorAssignable,
    assignedAuthors,
    assignmentError,
    contributors,
    requestedTeams,
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
  const warnings = [];
  const core = {
    info: (message) => logs.push(message),
    warning: (message) => warnings.push(message),
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction(
    "github",
    "context",
    "core",
    extractGithubScript(workflow),
  );

  await execute(github, context, core);

  return { calls, logs, warnings };
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

  assert.equal(calls.checkUserCanBeAssigned.length, 1);
  assert.equal(calls.addAssignees.length, 1);
  assert.deepEqual(calls.addAssignees[0].assignees, ["author"]);
  assert.equal(calls.requestReviewers.length, 1);
  assert.deepEqual(calls.requestReviewers[0].reviewers, ["new-reviewer"]);
});

test("unassignable fork author is warned about without blocking review requests", async () => {
  const { calls, warnings } = await runWorkflowScript({
    authorAssignable: false,
    contributors: [{ login: "reviewer", type: "User" }],
  });

  assert.equal(calls.checkUserCanBeAssigned.length, 1);
  assert.equal(calls.addAssignees.length, 0);
  assert.equal(calls.requestReviewers.length, 1);
  assert.deepEqual(calls.requestReviewers[0].reviewers, ["reviewer"]);
  assert.ok(
    warnings.some(
      (message) =>
        message.includes("GitHub reports that this user is not assignable") &&
        message.includes("Continuing with reviewer processing"),
    ),
  );
});

test("assignment API failures are warned about without blocking review requests", async () => {
  const { calls, warnings } = await runWorkflowScript({
    assignmentError: Object.assign(new Error("Validation Failed"), {
      status: 422,
    }),
    contributors: [{ login: "reviewer", type: "User" }],
  });

  assert.equal(calls.checkUserCanBeAssigned.length, 1);
  assert.equal(calls.addAssignees.length, 1);
  assert.equal(calls.requestReviewers.length, 1);
  assert.ok(
    warnings.some(
      (message) =>
        message.includes("Validation Failed") &&
        message.includes("Continuing with reviewer processing"),
    ),
  );
});

test("a successful API response that omits the author is not treated as assigned", async () => {
  const { calls, warnings } = await runWorkflowScript({
    assignedAuthors: [],
    contributors: [{ login: "reviewer", type: "User" }],
  });

  assert.equal(calls.addAssignees.length, 1);
  assert.equal(calls.requestReviewers.length, 1);
  assert.ok(
    warnings.some(
      (message) =>
        message.includes("still does not list the author as an assignee") &&
        message.includes("Continuing with reviewer processing"),
    ),
  );
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

test("an existing team request suppresses individual review requests", async () => {
  const { calls, logs } = await runWorkflowScript({
    contributors: [
      { login: "author", type: "User" },
      { login: "team-member", type: "User" },
      { login: "other-contributor", type: "User" },
    ],
    requestedTeams: [{ slug: "maintainers" }],
  });

  assert.equal(calls.addAssignees.length, 1);
  assert.equal(calls.listContributors, 0);
  assert.equal(calls.requestReviewers.length, 0);
  assert.ok(
    logs.some((message) => message.includes("team(s): maintainers")),
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

  assert.equal(calls.checkUserCanBeAssigned.length, 0);
  assert.equal(calls.addAssignees.length, 0);
  assert.equal(calls.requestReviewers.length, 0);
  assert.ok(logs.some((message) => message.includes("already assigned")));
  assert.ok(
    logs.some((message) => message.includes("No new contributors")),
  );
});
