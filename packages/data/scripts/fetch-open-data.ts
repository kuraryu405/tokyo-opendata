/** Refresh reproducible, bundled Open Data caches. Runtime never fetches these URLs. */
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { adaptTokyoForeignPopulation } from "../src/adapters/open-data";
import type { LocalResourcesCache, PopulationCache } from "../src/adapters/types";
import { fetchKitaFacilityDataset, type VerifiedKitaFacilityDataset } from "../src/kita-facility-connector";

const tokyoPopulationUrl = "https://www.toukei.metro.tokyo.lg.jp/gaikoku/2026/ga26ev0300.csv";
const defaultOutputDirectory = join(process.cwd(), "src/normalized");
const populationDataUpdatedAt = "2026-01-01";
const requiredPopulationHeaders = ["地域階層", "地域コード", "国・地域(人)", "ミャンマー"] as const;

type UpdateOptions = {
  outputDirectory?: string;
};

export function parsePopulationCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let afterClosingQuote = false;
  const input = text.replace(/^\uFEFF/, "");

  const finishCell = () => {
    row.push(cell);
    cell = "";
    afterClosingQuote = false;
  };
  const finishRow = () => {
    finishCell();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        afterClosingQuote = true;
      } else {
        cell += character;
      }
      continue;
    }
    if (afterClosingQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new Error("CSV contains characters after a closing quote.");
    }
    if (character === '"') {
      if (cell.length > 0 || afterClosingQuote) throw new Error("CSV contains an unexpected quote.");
      quoted = true;
    } else if (character === ",") {
      finishCell();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      finishRow();
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quote.");
  if (cell.length > 0 || row.length > 0 || afterClosingQuote) finishRow();
  return rows;
}

function requiredHeaderIndex(header: string[], name: (typeof requiredPopulationHeaders)[number]): number {
  const matches = header.reduce<number[]>((indices, value, index) => {
    if (value.trim() === name) indices.push(index);
    return indices;
  }, []);
  if (matches.length !== 1) throw new Error(`Tokyo population CSV must contain exactly one ${name} column.`);
  const match = matches[0];
  if (match === undefined) throw new Error(`Tokyo population CSV is missing the ${name} column.`);
  return match;
}

export function buildKitaMyanmarPopulationCache(csv: string, fetchedAt: string): PopulationCache {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fetchedAt)) throw new Error("fetchedAt must use YYYY-MM-DD.");
  const [rawHeader, ...rawRows] = parsePopulationCsv(csv);
  if (!rawHeader?.length || rawRows.length === 0) throw new Error("Tokyo population CSV has no data rows.");
  const header = rawHeader.map((value) => value.trim());
  const dataRows = rawRows.filter((row) => row.some((cell) => cell.trim()));

  for (const [index, candidate] of dataRows.entries()) {
    if (candidate.length !== header.length) {
      throw new Error(`Tokyo population CSV row ${index + 2} has ${candidate.length} columns; expected ${header.length}.`);
    }
  }

  const hierarchyIndex = requiredHeaderIndex(header, "地域階層");
  const municipalityCodeIndex = requiredHeaderIndex(header, "地域コード");
  const municipalityNameIndex = requiredHeaderIndex(header, "国・地域(人)");
  const myanmarIndex = requiredHeaderIndex(header, "ミャンマー");
  const targetRows = dataRows.filter((candidate) => candidate[municipalityCodeIndex]?.trim() === "13117");
  if (targetRows.length !== 1) throw new Error("Tokyo population CSV must contain exactly one Kita City (13117) row.");
  const row = targetRows[0];
  if (!row) throw new Error("Tokyo population CSV did not retain the validated Kita City row.");

  const hierarchy = row[hierarchyIndex]?.trim() ?? "";
  const municipalityCode = row[municipalityCodeIndex]?.trim() ?? "";
  const municipalityName = row[municipalityNameIndex]?.trim() ?? "";
  const myanmarValue = row[myanmarIndex]?.trim() ?? "";
  if (hierarchy !== "4" || municipalityName !== "北区") {
    throw new Error("Tokyo population CSV row 13117 does not identify Kita City.");
  }
  if (!/^\d+$/.test(myanmarValue)) throw new Error("Kita City Myanmar value must be a non-negative integer.");
  const numericPopulation = Number(myanmarValue);
  if (!Number.isSafeInteger(numericPopulation)) throw new Error("Kita City Myanmar value exceeds the safe integer range.");

  const rawPopulation = {
    "地域階層": hierarchy,
    "地域コード": municipalityCode,
    "国・地域(人)": municipalityName,
    "ミャンマー": myanmarValue,
  };
  const myanmar = adaptTokyoForeignPopulation(rawPopulation);
  if (!myanmar || myanmar.residentPopulation !== numericPopulation) {
    throw new Error("Kita City / Myanmar could not be normalized after validation.");
  }

  return {
    sourceId: "TOKYO_FOREIGN_POPULATION_2026_01",
    fetchedAt,
    dataUpdatedAt: populationDataUpdatedAt,
    records: [{ ...myanmar, raw: rawPopulation }],
    coverageNotes: [
      "This is a Resident Basic Register statistic and does not fully represent short-term visitors or people stranded during a crisis.",
      "The cache intentionally includes only the Kita City / Myanmar demonstration row.",
    ],
  };
}

export async function updateOpenDataCaches(
  inputs: {
    populationCsv: string;
    facilityDataset: VerifiedKitaFacilityDataset;
    fetchedAt: string;
  },
  options: UpdateOptions = {},
): Promise<{ populationCache: PopulationCache; resourceCache: LocalResourcesCache }> {
  const outputDirectory = options.outputDirectory ?? defaultOutputDirectory;
  // The facility dataset arrives already verified and exactly-counted by
  // buildVerifiedKitaFacilityDataset; this layer only stamps cache metadata.
  const resourceCache: LocalResourcesCache = {
    fetchedAt: inputs.facilityDataset.fetchedAt.slice(0, 10),
    resources: inputs.facilityDataset.resources,
    coverageNotes: [
      "Selected from https://www.city.kita.lg.jp/city-information/disclosure/1014461.html; facility rows are cached for a stable MVP and are not a complete inventory.",
      "A listed facility does not establish eligibility, capacity, language support, appointment availability, or service availability.",
    ],
  };
  const populationCache = buildKitaMyanmarPopulationCache(inputs.populationCsv, inputs.fetchedAt);

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    replaceFileAtomically(
      join(outputDirectory, "kita-myanmar-population.json"),
      `${JSON.stringify(populationCache, null, 2)}\n`,
    ),
    replaceFileAtomically(
      join(outputDirectory, "kita-local-resources.json"),
      `${JSON.stringify(resourceCache, null, 2)}\n`,
    ),
  ]);
  return { populationCache, resourceCache };
}

async function replaceFileAtomically(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
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
  const { populationCache, resourceCache } = await updateOpenDataCaches({
    populationCsv: new TextDecoder("utf-8").decode(populationBytes),
    facilityDataset,
    fetchedAt,
  });
  const population = populationCache.records[0]?.residentPopulation;
  if (population === undefined) throw new Error("Validated population cache did not contain the expected record.");
  console.log(`Cached Kita / Myanmar population (${population}); data date ${populationDataUpdatedAt}; fetched ${fetchedAt}.`);
  console.log(`Cached ${resourceCache.resources.length} Kita facility rows from CC BY 4.0 Open Data; fetched ${fetchedAt}.`);
}

const directEntry = process.argv[1];
if (directEntry && import.meta.url === pathToFileURL(directEntry).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Open Data refresh aborted without changing the cache: ${message}`);
    process.exitCode = 1;
  });
}
