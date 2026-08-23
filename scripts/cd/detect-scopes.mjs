import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function classifyChangedPaths(paths) {
  let user = false;
  let municipality = false;

  for (const path of paths.filter(Boolean)) {
    if (path.startsWith("apps/user/")) {
      user = true;
    } else if (path.startsWith("apps/municipality/")) {
      municipality = true;
    } else {
      user = true;
      municipality = true;
    }
  }

  return { user, municipality };
}

function changedPaths(base, head) {
  if (!base) {
    return ["root-change"];
  }

  return execFileSync("git", ["diff", "--name-only", base, head], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

function writeOutputs(result) {
  const lines = `user=${result.user}\nmunicipality=${result.municipality}\n`;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, lines);
  } else {
    process.stdout.write(lines);
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const [, , base = "", head = "HEAD"] = process.argv;
  const paths = changedPaths(base, head);
  writeOutputs(classifyChangedPaths(paths));
}
