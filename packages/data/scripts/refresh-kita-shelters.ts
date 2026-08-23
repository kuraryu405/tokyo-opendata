import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchKitaEarthquakeShelters } from "../src/kita-shelter-connector";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(moduleDirectory, "../src/normalized/kita-earthquake-shelters.json");

export async function refreshBundledKitaShelters(options: {
  fetchImpl?: typeof fetch;
  now?: Date;
  targetPath?: string;
} = {}) {
  const result = await fetchKitaEarthquakeShelters({ fetchImpl: options.fetchImpl, now: options.now });
  if (result.status !== "validated") throw new Error("Bundled shelter refresh unexpectedly returned 304");
  const targetPath = options.targetPath ?? outputPath;
  const temporaryPath = `${targetPath}.tmp`;
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(result.dataset, null, 2)}\n`, "utf8");
  await rename(temporaryPath, targetPath);
  return result.dataset;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  refreshBundledKitaShelters()
    .then((dataset) => console.log(`Updated ${outputPath} with ${dataset.resources.length} verified shelters (${dataset.datasetVersion}).`))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
