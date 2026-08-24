import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);
const dependabotFile = new URL("../.github/dependabot.yml", import.meta.url);
const remoteActionPattern = /^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#\s*(\S.*))?$/;
const fullCommitPattern = /^[0-9a-f]{40}$/;
const releaseCommentPattern = /^v\d+(?:\.\d+){1,2}$/;
const reusableWorkflowCommentPattern = /^[a-z][a-z0-9-]*@[0-9a-f]{7,40}$/;
const expectedPermissions = {
  "assign-pr-people.yml": {
    contents: "read",
    issues: "write",
    "pull-requests": "write",
  },
  "ci.yml": { contents: "read" },
  "contributors.yml": { contents: "read" },
  "deploy-worker.yml": { contents: "read" },
  "release.yml": { actions: "read", contents: "read" },
};

function readTopLevelPermissions(contents) {
  const block = contents.match(/^permissions:\s*\n((?:  [^\n]+\n?)+)/m)?.[1];
  assert.ok(block, "workflow must declare top-level permissions");

  return Object.fromEntries(
    block
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/:\s+/, 2)),
  );
}

test("remote Actions and reusable workflows are pinned to commit SHAs", async () => {
  const workflowFiles = (await readdir(workflowsDirectory))
    .filter((fileName) => /\.ya?ml$/.test(fileName))
    .sort();
  const mutableReferences = [];
  let remoteActionCount = 0;

  for (const fileName of workflowFiles) {
    const contents = await readFile(new URL(fileName, workflowsDirectory), "utf8");
    const lines = contents.split("\n");

    lines.forEach((line, index) => {
      const match = line.match(remoteActionPattern);
      if (!match) return;

      const [repository, reference] = match[1].split("@");
      if (!reference || repository.startsWith("./") || repository.startsWith("docker://")) {
        return;
      }

      remoteActionCount += 1;
      const releaseComment = match[2];
      const isReusableWorkflow = repository.includes("/.github/workflows/");
      const hasExpectedComment = isReusableWorkflow
        ? reusableWorkflowCommentPattern.test(releaseComment ?? "")
        : releaseCommentPattern.test(releaseComment ?? "");

      if (!fullCommitPattern.test(reference) || !hasExpectedComment) {
        mutableReferences.push(`${fileName}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.ok(remoteActionCount > 0, "expected at least one remote action reference");
  assert.deepEqual(
    mutableReferences,
    [],
    `remote references must use a 40-character commit SHA and an approved version comment:\n${mutableReferences.join("\n")}`,
  );
});

test("Dependabot monitors pinned GitHub Actions", async () => {
  const contents = await readFile(dependabotFile, "utf8");
  const githubActionsBlock = contents.match(
    /- package-ecosystem:\s*["']?github-actions["']?[\s\S]*?(?=\n\s*- package-ecosystem:|$)/,
  )?.[0];

  assert.ok(githubActionsBlock, "dependabot.yml must monitor the github-actions ecosystem");
  assert.match(githubActionsBlock, /\n\s+directory:\s*["']?\/["']?\s*$/m);
  assert.match(githubActionsBlock, /\n\s+schedule:\s*\n\s+interval:\s*["']?weekly["']?\s*$/m);
});

test("workflows keep their least-privilege repository token permissions", async () => {
  for (const [fileName, permissions] of Object.entries(expectedPermissions)) {
    const contents = await readFile(new URL(fileName, workflowsDirectory), "utf8");
    assert.deepEqual(readTopLevelPermissions(contents), permissions, fileName);
  }
});

test("the write-capable pull_request_target workflow never checks out PR code", async () => {
  const contents = await readFile(new URL("assign-pr-people.yml", workflowsDirectory), "utf8");

  assert.match(contents, /\bpull_request_target:\s*$/m);
  assert.doesNotMatch(contents, /\bactions\/checkout@/);
  assert.doesNotMatch(contents, /\bgithub\.event\.pull_request\.head\b/);
  assert.doesNotMatch(contents, /\bcontext\.payload\.pull_request\.head\b/);
  assert.doesNotMatch(contents, /\bpullRequest\.head\b/);
  assert.doesNotMatch(contents, /^\s+(?:-\s+)?run:/m);
});

test("contributor recognition uses trusted base code and skips safely without its token", async () => {
  const contents = await readFile(new URL("contributors.yml", workflowsDirectory), "utf8");
  const tokenGuardIndex = contents.indexOf("id: contributor_token");
  const checkoutIndex = contents.indexOf("uses: actions/checkout@");

  assert.match(contents, /^  pull_request_target:\s*$/m);
  assert.doesNotMatch(contents, /^  pull_request:\s*$/m);
  assert.doesNotMatch(contents, /\bgithub\.event\.pull_request\.head\b/);
  assert.match(
    contents,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/,
  );
  assert.ok(tokenGuardIndex >= 0 && tokenGuardIndex < checkoutIndex);
  assert.match(contents, /echo "configured=false" >> "\$GITHUB_OUTPUT"/);
  assert.match(contents, /Contributor recognition skipped/);
  assert.match(contents, />> "\$GITHUB_STEP_SUMMARY"/);
});

test("contributor recognition exposes the write PAT only to token detection and GitHub writes", async () => {
  const contents = await readFile(new URL("contributors.yml", workflowsDirectory), "utf8");

  assert.equal(
    contents.match(/\$\{\{ secrets\.CONTRIBUTOR_AUTOMATION_TOKEN \}\}/g)?.length,
    2,
  );
  assert.match(contents, /persist-credentials: false/);
  assert.doesNotMatch(
    contents,
    /token: \$\{\{ secrets\.CONTRIBUTOR_AUTOMATION_TOKEN \}\}/,
  );
  assert.doesNotMatch(
    contents,
    /GITHUB_TOKEN: \$\{\{ secrets\.CONTRIBUTOR_AUTOMATION_TOKEN \}\}/,
  );
  assert.match(contents, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(contents, /pnpm dlx all-contributors-cli@6\.26\.1 all-contributors add/);
  assert.match(contents, /-c core\.hooksPath=\/dev\/null/);
  assert.match(contents, /-c credential\.helper=/);
  assert.match(contents, /-c credential\.helper='!gh auth git-credential'/);
  assert.match(contents, /push --set-upstream origin "\$BRANCH"/);
  assert.doesNotMatch(contents, /https:\/\/x-access-token:/);
  assert.match(contents, /--repo "\$GITHUB_REPOSITORY"/);
  assert.match(contents, /--base "\$DEFAULT_BRANCH"/);
});

test("contributor recognition validates event-derived shell inputs before using them", async () => {
  const contents = await readFile(new URL("contributors.yml", workflowsDirectory), "utf8");

  assert.match(
    contents,
    /\[\[ "\$CONTRIBUTOR" =~ \^\[A-Za-z0-9\]\[A-Za-z0-9-\]\{0,38\}\$ \]\]/,
  );
  assert.match(contents, /\[\[ "\$SOURCE_PR" =~ \^\[0-9\]\+\$ \]\]/);
  assert.match(contents, /branch="chore\/recognize-\$\{CONTRIBUTOR\}-\$\{SOURCE_PR\}"/);
});

test("Cloudflare credentials are scoped to deployment steps", async () => {
  const contents = await readFile(new URL("deploy-worker.yml", workflowsDirectory), "utf8");
  const jobLevelSecretEnv = contents.match(/\n    env:\n((?:      [^\n]+\n)+)/g) ?? [];

  assert.deepEqual(
    jobLevelSecretEnv.filter((block) => block.includes("CLOUDFLARE_API_TOKEN")),
    [],
    "Cloudflare credentials must not be available to an entire job",
  );

  const scopedSecretBlocks = contents.match(/\n        env:\n((?:          [^\n]+\n)+)/g) ?? [];
  assert.equal(
    scopedSecretBlocks.filter((block) => block.includes("CLOUDFLARE_API_TOKEN")).length,
    5,
    "Cloudflare credentials should be present only on D1 identity verification, staging deploy, production previous-version, production deploy, and rollback steps",
  );
});
