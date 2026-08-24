/** Refresh reproducible, bundled Open Data caches. Runtime never fetches these URLs. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { adaptTokyoForeignPopulation, type RawResourceRecord } from "../src/adapters/open-data";
import type { LocalResourcesCache, PopulationCache } from "../src/adapters/types";
import { fetchKitaFacilityDataset } from "../src/kita-facility-connector";

const tokyoPopulationUrl = "https://www.toukei.metro.tokyo.lg.jp/gaikoku/2026/ga26ev0300.csv";
const outputDirectory = join(process.cwd(), "src/normalized");

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted; }
    else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && text[index + 1] === "\n") index += 1; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (cell || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

function csvRecords(text: string): RawResourceRecord[] {
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!header?.length) throw new Error("CSV did not contain a header row.");
  return rows.filter((row) => row.some((cell) => cell.trim())).map((row) => Object.fromEntries(header.map((key, index) => [key.trim(), row[index]?.trim() ?? ""])));
}

async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { "User-Agent": "StayBridgeTokyo-data-refresh/0.1" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const [populationBytes, facilityDataset] = await Promise.all([
    fetchBytes(tokyoPopulationUrl),
    fetchKitaFacilityDataset(),
  ]);
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const populationRecords = csvRecords(new TextDecoder("utf-8").decode(populationBytes));
  const rawPopulation = populationRecords.find((record) => record["地域コード"] === "13117");
  const myanmar = rawPopulation && adaptTokyoForeignPopulation(rawPopulation);
  if (!rawPopulation || !myanmar) throw new Error("Kita City / Myanmar was not found as a numeric Tokyo population row.");
  const populationCache: PopulationCache = { sourceId: "TOKYO_FOREIGN_POPULATION_2026_01", fetchedAt, dataUpdatedAt: "2026-01-01", records: [{ ...myanmar, raw: { "地域階層": String(rawPopulation["地域階層"] ?? ""), "地域コード": String(rawPopulation["地域コード"] ?? ""), "国・地域(人)": String(rawPopulation["国・地域(人)"] ?? ""), "ミャンマー": String(rawPopulation["ミャンマー"] ?? "") } }], coverageNotes: ["This is a Resident Basic Register statistic and does not fully represent short-term visitors or people stranded during a crisis.", "The cache intentionally includes only the Kita City / Myanmar demonstration row."] };
  const resourceCache: LocalResourcesCache = {
    fetchedAt: facilityDataset.fetchedAt.slice(0, 10),
    resources: facilityDataset.resources,
    coverageNotes: [
      "Selected from https://www.city.kita.lg.jp/city-information/disclosure/1014461.html; facility rows are cached for a stable MVP and are not a complete inventory.",
      "A listed facility does not establish eligibility, capacity, language support, appointment availability, or service availability.",
    ],
  };
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([writeFile(join(outputDirectory, "kita-myanmar-population.json"), `${JSON.stringify(populationCache, null, 2)}\n`), writeFile(join(outputDirectory, "kita-local-resources.json"), `${JSON.stringify(resourceCache, null, 2)}\n`)]);
  console.log(`Cached Kita / Myanmar population (${myanmar.residentPopulation}); data date 2026-01-01; fetched ${fetchedAt}.`);
  console.log(`Cached ${facilityDataset.resources.length} Kita facility rows from CC BY 4.0 Open Data; fetched ${fetchedAt}.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Open Data refresh aborted without changing the cache: ${message}`);
  process.exitCode = 1;
});
