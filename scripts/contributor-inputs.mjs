import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const githubLoginPattern = /^(?=.{1,39}$)[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const pullRequestNumberPattern = /^[1-9][0-9]*$/;

export function resolveContributorInputs(contributor, sourcePr) {
  if (typeof contributor !== "string" || !githubLoginPattern.test(contributor)) {
    throw new Error("Unexpected GitHub login format");
  }

  const sourcePrString = String(sourcePr);
  if (!pullRequestNumberPattern.test(sourcePrString)) {
    throw new Error("Unexpected source PR number");
  }

  return {
    contributor,
    sourcePr: sourcePrString,
    branch: `chore/recognize-${contributor}-${sourcePrString}`,
  };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const [, , contributor, sourcePr] = process.argv;
  const inputs = resolveContributorInputs(contributor, sourcePr);
  process.stdout.write(
    `contributor=${inputs.contributor}\nsource_pr=${inputs.sourcePr}\nbranch=${inputs.branch}\n`,
  );
}
