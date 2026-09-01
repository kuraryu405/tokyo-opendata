import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceOwners = [
  { kind: "app", directory: "apps/municipality" },
  { kind: "app", directory: "apps/user" },
  { kind: "package", directory: "packages/data" },
  { kind: "package", directory: "packages/domain" },
  { kind: "package", directory: "packages/i18n" },
  { kind: "package", directory: "packages/sites-vite-plugin" },
  { kind: "package", directory: "packages/ui" },
  { kind: "package", directory: "packages/worker-runtime" },
].map((owner) => ({ ...owner, directoryPath: resolve(repositoryRoot, owner.directory) }));
const ignoredDirectoryNames = new Set([".vinext", ".wrangler", "dist", "node_modules"]);
const moduleExtensions = new Set([".mjs", ".ts", ".tsx"]);

async function sourceFilesWithin(directoryPath) {
  const sourceFiles = [];
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    if (ignoredDirectoryNames.has(entry.name)) continue;
    const entryPath = resolve(directoryPath, entry.name);
    if (entry.isDirectory()) {
      sourceFiles.push(...await sourceFilesWithin(entryPath));
    } else if (moduleExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      sourceFiles.push(entryPath);
    }
  }
  return sourceFiles;
}

function moduleSpecifiers(source) {
  const specifiers = [];
  const importPattern = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)['"]/gu;
  for (const match of source.matchAll(importPattern)) specifiers.push(match[1]);
  return specifiers;
}

function ownerForPath(targetPath) {
  return workspaceOwners.find(({ directoryPath }) => (
    targetPath === directoryPath || targetPath.startsWith(`${directoryPath}${sep}`)
  ));
}

test("app and package ownership direction stays explicit", async () => {
  const manifests = new Map();
  for (const owner of workspaceOwners) {
    owner.manifest = JSON.parse(await readFile(resolve(owner.directoryPath, "package.json"), "utf8"));
    manifests.set(owner.manifest.name, owner);
  }

  for (const owner of workspaceOwners) {
    for (const sourceFile of await sourceFilesWithin(owner.directoryPath)) {
      const source = await readFile(sourceFile, "utf8");
      for (const specifier of moduleSpecifiers(source)) {
        const sourceLabel = relative(repositoryRoot, sourceFile);
        if (specifier.startsWith("@staybridge/")) {
          assert.doesNotMatch(specifier, /\/src(?:\/|$)/u, `${sourceLabel} bypasses a package export`);
          const packageName = specifier.split("/").slice(0, 2).join("/");
          const targetOwner = manifests.get(packageName);
          assert.ok(targetOwner, `${sourceLabel} imports unknown ${packageName}`);
          if (targetOwner === owner) continue;
          const declaredDependencies = {
            ...owner.manifest.dependencies,
            ...owner.manifest.devDependencies,
            ...owner.manifest.optionalDependencies,
            ...owner.manifest.peerDependencies,
          };
          assert.ok(
            Object.hasOwn(declaredDependencies, packageName),
            `${sourceLabel} imports undeclared workspace dependency ${packageName}`,
          );
          continue;
        }

        if (!specifier.startsWith(".")) continue;
        const targetOwner = ownerForPath(resolve(dirname(sourceFile), specifier));
        if (!targetOwner || targetOwner === owner) continue;
        assert.fail(
          `${sourceLabel} crosses from ${owner.directory} to ${targetOwner.directory} with ${specifier}`,
        );
      }
    }
  }
});

test("the StayBridge composition root delegates routing, storage, and API ownership", async () => {
  const source = await readFile(
    resolve(repositoryRoot, "apps/user/src/components/StayBridgeApp.tsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /\bsessionStorage\b/u);
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /\b(?:usePathname|useRouter|useSearchParams)\b/u);
  assert.doesNotMatch(source, /from ["']next\/navigation["']/u);
});
