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
  authorEligibilityError,
  assignedAuthors = [{ login: "author" }],
  assignmentError,
  collaborators = [],
  collaboratorError,
  requestedReviewersError,
  requestedTeams = [],
  requestedUsers = [],
  reviewerFailures = new Set(),
  reviews = [],
}) {
  const calls = {
    addAssignees: [],
    checkUserCanBeAssigned: [],
    listCollaborators: [],
    requestReviewers: [],
    sequence: [],
  };

  const listCollaborators = async () => ({ data: collaborators });
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
        calls.sequence.push("checkUserCanBeAssigned");

        if (authorEligibilityError) {
          throw authorEligibilityError;
        }

        if (!authorAssignable) {
          throw Object.assign(new Error("Not Found"), { status: 404 });
        }

        return { status: 204 };
      },
      paginate: async (method, parameters) => {
        if (method === listCollaborators) {
          calls.listCollaborators.push(parameters);
          calls.sequence.push("listCollaborators");

          if (collaboratorError) {
            throw collaboratorError;
          }

          return collaborators;
        }

        if (method === listReviews) {
          calls.sequence.push("listReviews");
          return reviews;
        }

        throw new Error("Unexpected paginated method");
      },
      rest: {
        issues: {
          addAssignees: async (parameters) => {
            calls.addAssignees.push(parameters);
            calls.sequence.push("addAssignees");

            if (assignmentError) {
              throw assignmentError;
            }

            return { data: { assignees: assignedAuthors } };
          },
        },
        pulls: {
          listRequestedReviewers: async () => {
            calls.sequence.push("listRequestedReviewers");

            if (requestedReviewersError) {
              throw requestedReviewersError;
            }

            return { data: { users: requestedUsers, teams: requestedTeams } };
          },
          listReviews,
          requestReviewers: async (parameters) => {
            calls.requestReviewers.push(parameters);

            if (reviewerFailures.has(parameters.reviewers[0])) {
              throw new Error(`Cannot request ${parameters.reviewers[0]}`);
            }
          },
        },
        repos: {
          listCollaborators,
        },
      },
    },
  };
}

async function runWorkflowScript({
  action = "ready_for_review",
  assignees = [],
  authorAssignable,
  authorEligibilityError,
  assignedAuthors,
  assignmentError,
  collaborators = [],
  collaboratorError,
  requestedReviewersError,
  requestedTeams,
  requestedUsers,
  reviewerFailures,
  reviews,
}) {
  const { calls, github } = createGithubMock({
    authorAssignable,
    authorEligibilityError,
    assignedAuthors,
    assignmentError,
    collaborators,
    collaboratorError,
    requestedReviewersError,
    requestedTeams,
    requestedUsers,
    reviewerFailures,
    reviews,
  });
  const logs = [];
  const warnings = [];
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
    collaborators: [
      { login: "author", type: "User", permissions: { push: true } },
      {
        login: "already-requested",
        type: "User",
        permissions: { push: true },
      },
      {
        login: "already-reviewed",
        type: "User",
        permissions: { push: true },
      },
      { login: "new-reviewer", type: "User", permissions: { push: true } },
      { login: "past-contributor", type: "User", permissions: { push: false } },
      { login: "automation", type: "Bot", permissions: { push: true } },
    ],
    requestedUsers: [{ login: "already-requested" }],
    reviews: [{ user: { login: "already-reviewed" } }],
  });

  assert.equal(calls.checkUserCanBeAssigned.length, 1);
  assert.equal(calls.addAssignees.length, 1);
  assert.deepEqual(calls.addAssignees[0].assignees, ["author"]);
  assert.equal(calls.requestReviewers.length, 1);
  assert.deepEqual(calls.requestReviewers[0].reviewers, ["new-reviewer"]);
  assert.equal(calls.listCollaborators[0].permission, "push");
});

test("unassignable fork author is warned about without blocking review requests", async () => {
  const { calls, warnings } = await runWorkflowScript({
    authorAssignable: false,
    collaborators: [
      { login: "reviewer", type: "User", permissions: { push: true } },
    ],
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

test("eligibility check failures still attempt assignment and validate the response", async () => {
  const { calls, warnings } = await runWorkflowScript({
    authorEligibilityError: Object.assign(
      new Error("Internal Server Error"),
      { status: 500 },
    ),
    collaborators: [{ login: "reviewer", type: "User", permissions: { push: true } }],
  });

  assert.equal(calls.checkUserCanBeAssigned.length, 1);
  assert.equal(calls.addAssignees.length, 1);
  assert.equal(calls.requestReviewers.length, 1);
  assert.ok(
    warnings.some(
      (message) =>
        message.includes("Internal Server Error") &&
        message.includes("Attempting the assignment anyway") &&
        message.includes("validating the response"),
    ),
  );
});

test("assignment API failures are warned about without blocking review requests", async () => {
  const { calls, warnings } = await runWorkflowScript({
    assignmentError: Object.assign(new Error("Validation Failed"), {
      status: 422,
    }),
    collaborators: [
      { login: "reviewer", type: "User", permissions: { push: true } },
    ],
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
    collaborators: [
      { login: "reviewer", type: "User", permissions: { push: true } },
    ],
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
    collaborators: [
      { login: "author", type: "User", permissions: { push: true } },
      { login: "automation", type: "Bot", permissions: { push: true } },
    ],
  });

  assert.equal(calls.addAssignees.length, 1);
  assert.deepEqual(calls.addAssignees[0].assignees, ["author"]);
  assert.equal(calls.requestReviewers.length, 0);
  assert.ok(
    logs.some((message) => message.includes("No new collaborators")),
  );
});

test("an existing team request suppresses individual review requests", async () => {
  const { calls, logs } = await runWorkflowScript({
    collaborators: [
      { login: "author", type: "User", permissions: { push: true } },
      { login: "team-member", type: "User", permissions: { push: true } },
      {
        login: "other-collaborator",
        type: "User",
        permissions: { push: true },
      },
    ],
    requestedTeams: [{ slug: "maintainers" }],
  });

  assert.equal(calls.addAssignees.length, 1);
  assert.equal(calls.listCollaborators.length, 0);
  assert.equal(calls.requestReviewers.length, 0);
  assert.ok(
    logs.some((message) => message.includes("team(s): maintainers")),
  );
});

test("reruns do not reassign the author or notify previous reviewers", async () => {
  const { calls, logs } = await runWorkflowScript({
    action: "reopened",
    assignees: [{ login: "author" }],
    collaborators: [
      { login: "author", type: "User", permissions: { push: true } },
      {
        login: "already-requested",
        type: "User",
        permissions: { push: true },
      },
      {
        login: "already-reviewed",
        type: "User",
        permissions: { push: true },
      },
    ],
    requestedUsers: [{ login: "already-requested" }],
    reviews: [{ user: { login: "already-reviewed" } }],
  });

  assert.equal(calls.checkUserCanBeAssigned.length, 0);
  assert.equal(calls.addAssignees.length, 0);
  assert.equal(calls.requestReviewers.length, 0);
  assert.ok(logs.some((message) => message.includes("already assigned")));
  assert.ok(
    logs.some((message) => message.includes("No new collaborators")),
  );
});

test("reviewer discovery failure does not undo or block author assignment", async () => {
  const { calls, warnings } = await runWorkflowScript({
    collaboratorError: new Error("temporary collaborator API failure"),
  });

  assert.deepEqual(calls.sequence, [
    "checkUserCanBeAssigned",
    "addAssignees",
    "listRequestedReviewers",
    "listReviews",
    "listCollaborators",
  ]);
  assert.equal(calls.requestReviewers.length, 0);
  assert.ok(
    warnings.some((message) =>
      message.includes(
        "Reviewer discovery failed after author assignment processing: " +
          "temporary collaborator API failure",
      ),
    ),
  );
});

test("the first reviewer discovery API failure happens after author processing", async () => {
  const { calls, warnings } = await runWorkflowScript({
    requestedReviewersError: new Error("temporary review request API failure"),
  });

  assert.deepEqual(calls.sequence, [
    "checkUserCanBeAssigned",
    "addAssignees",
    "listRequestedReviewers",
  ]);
  assert.equal(calls.requestReviewers.length, 0);
  assert.ok(
    warnings.some((message) =>
      message.includes("temporary review request API failure"),
    ),
  );
});

test("prior trusted review participants count toward the three-person limit", async () => {
  const { calls } = await runWorkflowScript({
    collaborators: [
      "already-requested",
      "already-reviewed",
      "reviewer-d",
      "reviewer-b",
      "reviewer-c",
      "reviewer-a",
    ].map((login) => ({ login, type: "User", permissions: { push: true } })),
    requestedUsers: [{ login: "already-requested" }],
    reviews: [{ user: { login: "already-reviewed" } }],
  });

  assert.deepEqual(
    calls.requestReviewers.map(({ reviewers }) => reviewers),
    [["reviewer-a"]],
  );
});

test("one invalid reviewer does not prevent requests to other valid reviewers", async () => {
  const { calls, logs, warnings } = await runWorkflowScript({
    collaborators: [
      "a-invalid",
      "b-valid",
      "c-valid",
      "d-valid",
    ].map((login) => ({ login, type: "User", permissions: { push: true } })),
    reviewerFailures: new Set(["a-invalid"]),
  });

  assert.deepEqual(
    calls.requestReviewers.map(({ reviewers }) => reviewers),
    [["a-invalid"], ["b-valid"], ["c-valid"], ["d-valid"]],
  );
  assert.ok(
    warnings.some((message) =>
      message.includes("a-invalid: Cannot request a-invalid"),
    ),
  );
  assert.equal(
    logs.filter((message) => message.includes("Requested a review from")).length,
    3,
  );
});
