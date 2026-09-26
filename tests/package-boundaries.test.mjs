import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDirectories = [
  "apps/municipality",
  "apps/user",
  "packages/data",
  "packages/domain",
  "packages/i18n",
  "packages/sites-vite-plugin",
  "packages/ui",
  "packages/worker-runtime",
];
const ignoredDirectoryNames = new Set([".vinext", ".wrangler", "dist", "node_modules"]);
const sourceExtensions = new Set([".css", ".mjs", ".ts", ".tsx"]);

async function workspaceManifests() {
  return Promise.all(workspaceDirectories.map(async (directory) => {
    const directoryPath = resolve(repositoryRoot, directory);
    const manifest = JSON.parse(await readFile(resolve(directoryPath, "package.json"), "utf8"));
    return { directory, directoryPath, manifest };
  }));
}

function exportTargets(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(exportTargets);
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(exportTargets);
}

function exportDeclarations(exportsField) {
  if (
    typeof exportsField === "string"
    || Array.isArray(exportsField)
    || Object.keys(exportsField).every((key) => !key.startsWith("."))
  ) {
    return [[".", exportsField]];
  }
  return Object.entries(exportsField);
}

function declaresExport(exportsField, subpath) {
  if (!exportsField) return false;
  if (typeof exportsField === "string" || Array.isArray(exportsField)) return subpath === ".";
  const keys = Object.keys(exportsField);
  if (keys.every((key) => !key.startsWith("."))) return subpath === ".";
  return Object.hasOwn(exportsField, subpath);
}

async function sourceFilesWithin(directoryPath) {
  const sourceFiles = [];
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    if (ignoredDirectoryNames.has(entry.name)) continue;
    const entryPath = resolve(directoryPath, entry.name);
    if (entry.isDirectory()) {
      sourceFiles.push(...await sourceFilesWithin(entryPath));
    } else if (sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      sourceFiles.push(entryPath);
    }
  }
  return sourceFiles;
}

function workspaceSpecifiers(source) {
  const specifiers = [];
  const importPattern = /(?:from\s+|import\s*\(\s*|import\s+|@import\s+(?:url\(\s*)?)["'](@staybridge\/[a-z0-9-]+(?:\/[^"']+)?)['"]/gu;
  for (const match of source.matchAll(importPattern)) specifiers.push(match[1]);
  return specifiers;
}

test("declared workspace exports resolve to in-package files", async () => {
  for (const { directoryPath, manifest } of await workspaceManifests()) {
    if (!manifest.exports) continue;
    for (const [subpath, declaration] of exportDeclarations(manifest.exports)) {
      const targets = exportTargets(declaration);
      assert.ok(targets.length > 0, `${manifest.name} ${subpath} has no export target`);
      for (const target of targets) {
        assert.match(target, /^\.\//u, `${manifest.name} ${subpath} must use an in-package target`);
        const targetPath = resolve(directoryPath, target);
        const pathWithinPackage = relative(directoryPath, targetPath);
        assert.ok(
          pathWithinPackage !== ".." && !pathWithinPackage.startsWith(`..${sep}`),
          `${manifest.name} ${subpath} escapes its package`,
        );
        await access(targetPath);
      }
    }
  }
});

test("cross-package specifiers match the public export map", async () => {
  const manifests = await workspaceManifests();
  const manifestByName = new Map(manifests.map((entry) => [entry.manifest.name, entry.manifest]));
  const sourceFiles = (await Promise.all(manifests.map(({ directoryPath }) => (
    sourceFilesWithin(directoryPath)
  )))).flat();

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8");
    for (const specifier of workspaceSpecifiers(source)) {
      const packageName = specifier.split("/").slice(0, 2).join("/");
      const targetManifest = manifestByName.get(packageName);
      assert.ok(targetManifest, `${relative(repositoryRoot, sourceFile)} imports unknown ${packageName}`);
      const exportSubpath = specifier === packageName ? "." : `.${specifier.slice(packageName.length)}`;
      assert.ok(
        declaresExport(targetManifest.exports, exportSubpath),
        `${relative(repositoryRoot, sourceFile)} imports private ${specifier}`,
      );
    }
  }
});
