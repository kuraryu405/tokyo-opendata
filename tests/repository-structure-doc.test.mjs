import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const structureDocPath = resolve(repositoryRoot, "docs/repository-structure.md");
const startMarker = "<!-- repository-structure-paths:start -->";
const endMarker = "<!-- repository-structure-paths:end -->";

function readDocumentedPaths() {
  const document = readFileSync(structureDocPath, "utf8");
  const start = document.indexOf(startMarker);
  const end = document.indexOf(endMarker);

  assert.notEqual(start, -1, "repository structure path start marker is missing");
  assert.notEqual(end, -1, "repository structure path end marker is missing");
  assert.ok(end > start, "repository structure path markers are out of order");

  const canonicalPathSection = document.slice(start + startMarker.length, end);
  const lines = canonicalPathSection.split("\n").map((line) => line.trim()).filter(Boolean);
  const documentedPaths = lines.map((line) => {
    const match = /^- `([^`]+)`$/.exec(line);
    assert.ok(match, `canonical path entries must use '- \`path\`' syntax: ${line}`);
    return match[1];
  });

  assert.ok(documentedPaths.length > 0, "repository structure path list is empty");
  assert.equal(new Set(documentedPaths).size, documentedPaths.length, "repository structure path list contains duplicates");
  return documentedPaths;
}

test("repository structure documentation only references safe existing canonical paths", () => {
  const documentedPaths = readDocumentedPaths();

  for (const documentedPath of documentedPaths) {
    assert.equal(isAbsolute(documentedPath), false, `documented repository path must be relative: ${documentedPath}`);
    assert.equal(
      documentedPath.split(/[\\/]/).includes(".."),
      false,
      `documented repository path must not traverse outside the repository: ${documentedPath}`,
    );
    assert.equal(
      existsSync(resolve(repositoryRoot, documentedPath)),
      true,
      `documented repository path does not exist: ${documentedPath}`,
    );
  }
});

test("repository structure documentation inventories every current app and workspace package", () => {
  const documentedPaths = readDocumentedPaths();
  const workspaceRoots = ["apps", "packages"];
  const actualWorkspaceDirectories = workspaceRoots.flatMap((workspaceRoot) =>
    readdirSync(resolve(repositoryRoot, workspaceRoot), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${workspaceRoot}/${entry.name}`),
  ).sort();
  const documentedWorkspaceDirectories = documentedPaths
    .filter((documentedPath) => /^(?:apps|packages)\/[^/]+$/.test(documentedPath))
    .sort();

  assert.deepEqual(
    documentedWorkspaceDirectories,
    actualWorkspaceDirectories,
    "repository structure docs must list every current app and workspace package",
  );
});
