import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function findUploadedVersion(versions, tag) {
  const matches = versions
    .filter((version) => version.annotations?.["workers/tag"] === tag)
    .sort((left, right) =>
      left.metadata.created_on.localeCompare(right.metadata.created_on),
    );
  return matches.at(-1)?.id ?? "";
}

export function currentProductionVersion(deployment) {
  const versions = deployment?.versions ?? [];
  return [...versions].sort(
    (left, right) => right.percentage - left.percentage,
  )[0]?.version_id ?? "";
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const [, , command, path, value] = process.argv;
  if (!command || !path) {
    throw new Error(
      "usage: wrangler-state.mjs <uploaded|current|assert-active> <json-file> [value]",
    );
  }

  const payload = readJson(path);
  if (command === "uploaded") {
    const version = findUploadedVersion(payload, value);
    if (!version) {
      throw new Error(`no uploaded Worker Version found for tag ${value}`);
    }
    process.stdout.write(version);
  } else if (command === "current") {
    process.stdout.write(currentProductionVersion(payload));
  } else if (command === "assert-active") {
    const active = currentProductionVersion(payload);
    if (active !== value) {
      throw new Error(`expected active version ${value}, received ${active}`);
    }
    process.stdout.write(active);
  } else {
    throw new Error(`unknown wrangler-state command: ${command}`);
  }
}
