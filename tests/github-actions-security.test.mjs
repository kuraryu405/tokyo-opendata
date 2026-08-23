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
  "staging-issues-60-62-e2e.yml": { contents: "read" },
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

test("the Issue 60 and 62 integration workflow is dispatch-only and staging-only", async () => {
  const contents = await readFile(
    new URL("staging-issues-60-62-e2e.yml", workflowsDirectory),
    "utf8",
  );

  assert.match(contents, /workflow_dispatch:/);
  assert.doesNotMatch(contents, /^\s*(push|pull_request|workflow_run):/m);
  assert.match(contents, /staybridge-staging/);
  assert.doesNotMatch(contents, /\bproduction\b/i);
  assert.doesNotMatch(contents, /\bd1 create\b/i);
  assert.match(contents, /0001_backend_foundation\.sql/);
  assert.match(contents, /0002_consented_persistence\.sql/);
  assert.match(contents, /0003_open_data_cache\.sql/);
  assert.match(contents, /trap cleanup EXIT/);
  assert.match(contents, /sit_issue60_e2e_/);
  assert.match(contents, /--branch test\/issues-60-62-staging/);
  assert.match(contents, /c9cf471d29694790c473bf75b7fbdda8901a3b73/);
  assert.match(contents, /BASE_URL="\$user_url" MUNICIPALITY_URL="\$municipality_url"/);
  assert.match(contents, /playwright test e2e\/staging-issues-60-62\.spec\.ts --project=functional/);
  const externalSetup = contents.indexOf("e2e_commit=c9cf471d29694790c473bf75b7fbdda8901a3b73");
  const fixtureInsert = contents.indexOf("INSERT INTO situation_submissions");
  const playwrightRun = contents.indexOf("playwright test e2e/staging-issues-60-62.spec.ts --project=functional");
  assert.ok(externalSetup >= 0 && externalSetup < fixtureInsert, "external E2E setup must finish before the fixture insert");
  assert.ok(fixtureInsert >= 0 && fixtureInsert < playwrightRun, "Playwright must run after the fixture insert");
});
