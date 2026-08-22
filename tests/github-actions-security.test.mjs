import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);
const dependabotFile = new URL("../.github/dependabot.yml", import.meta.url);
const remoteActionPattern = /^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#\s*(\S.*))?$/;
const fullCommitPattern = /^[0-9a-f]{40}$/;
const releaseCommentPattern = /^v\d+(?:\.\d+){1,2}$/;
const expectedPermissions = {
  "assign-pr-people.yml": {
    contents: "read",
    issues: "write",
    "pull-requests": "write",
  },
  "ci.yml": { contents: "read" },
  "contributors.yml": { contents: "read" },
  "deploy.yml": { contents: "read" },
  "e2e-dispatch.yml": { contents: "read" },
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

test("remote GitHub Actions are pinned to full commit SHAs with release comments", async () => {
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
      if (!fullCommitPattern.test(reference) || !releaseCommentPattern.test(releaseComment ?? "")) {
        mutableReferences.push(`${fileName}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.ok(remoteActionCount > 0, "expected at least one remote action reference");
  assert.deepEqual(
    mutableReferences,
    [],
    `remote actions must use a 40-character commit SHA and version comment:\n${mutableReferences.join("\n")}`,
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
