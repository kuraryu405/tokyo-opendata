/**
 * Refresh the small, auditable population cache used by the demo.
 * Run with: pnpm --filter @staybridge/data data:fetch
 *
 * Only the Tokyo foreign-population CSV is downloaded automatically. Kita's
 * facility sources are curated official pages/PDFs, so they require review
 * before changing normalized records rather than silently scraping a layout.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PopulationCache } from "../src/adapters/types";
import { TOKYO_FOREIGN_POPULATION_SOURCE } from "../src/source-descriptors";

const OUTPUT_PATH = fileURLToPath(new URL("../src/normalized/kita-myanmar-population.json", import.meta.url));
const REQUIRED_HEADERS = ["地域階層", "地域コード", "国・地域(人)", "ミャンマー"] as const;
const KITA_CITY = {
  hierarchy: "4",
  code: "13117",
  sourceName: "北区",
  normalizedName: "Kita",
  nationality: "Myanmar",
} as const;

type RefreshOptions = {
  fetchImpl?: typeof fetch;
  now?: Date;
  outputPath?: string;
};

/** Parse CSV strictly enough to reject malformed or partially shifted rows. */
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;
  const input = csv.replace(/^\uFEFF/, "");

  const finishCell = () => {
    row.push(cell);
    cell = "";
    afterQuote = false;
  };
  const finishRow = () => {
    const isPhysicalBlankLine = row.length === 0 && cell.length === 0 && !afterQuote;
    finishCell();
    if (!isPhysicalBlankLine) rows.push(row);
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
        afterQuote = true;
      } else {
        cell += character;
      }
      continue;
    }

    if (afterQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new Error("CSV contains characters after a closing quote.");
    }
    if (character === '"') {
      if (cell.length > 0 || afterQuote) throw new Error("CSV contains an unexpected quote.");
      quoted = true;
    } else if (character === ",") {
      finishCell();
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      finishRow();
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quote.");
  if (cell.length > 0 || row.length > 0 || afterQuote) finishRow();
  return rows;
}

function tokyoCalendarDate(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("The fetch time is invalid.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) throw new Error("The fetch date could not be formatted.");
  return `${year}-${month}-${day}`;
}

/** Convert the publisher CSV into the one-row cache only after validating it. */
export function buildKitaMyanmarPopulationCache(csv: string, fetchedAt: string): PopulationCache {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fetchedAt)) throw new Error("fetchedAt must use YYYY-MM-DD.");
  const [header, ...dataRows] = parseCsv(csv);
  if (!header || dataRows.length === 0) throw new Error("Tokyo CSV has no data rows.");

  const indexes = Object.fromEntries(REQUIRED_HEADERS.map((name) => {
    const matches = header.reduce<number[]>((found, value, index) => value === name ? [...found, index] : found, []);
    if (matches.length !== 1) throw new Error(`Tokyo CSV must contain exactly one ${name} column.`);
    return [name, matches[0]];
  })) as Record<(typeof REQUIRED_HEADERS)[number], number>;

  dataRows.forEach((candidate, index) => {
    if (candidate.length !== header.length) {
      throw new Error(`Tokyo CSV row ${index + 2} has ${candidate.length} columns; expected ${header.length}.`);
    }
  });

  const matches = dataRows.filter((candidate) => candidate[indexes["地域コード"]] === KITA_CITY.code);
  if (matches.length !== 1) throw new Error(`Tokyo CSV must contain exactly one Kita City (${KITA_CITY.code}) row.`);
  const row = matches[0];
  const hierarchy = row[indexes["地域階層"]];
  const sourceName = row[indexes["国・地域(人)"]];
  const myanmar = row[indexes["ミャンマー"]];
  if (hierarchy !== KITA_CITY.hierarchy || sourceName !== KITA_CITY.sourceName) {
    throw new Error(`Tokyo CSV row ${KITA_CITY.code} does not identify Kita City.`);
  }
  if (!/^\d+$/.test(myanmar)) throw new Error("Kita City Myanmar value must be a non-negative integer.");
  const residentPopulation = Number(myanmar);
  if (!Number.isSafeInteger(residentPopulation)) throw new Error("Kita City Myanmar value exceeds the safe integer range.");

  return {
    sourceId: TOKYO_FOREIGN_POPULATION_SOURCE.id,
    fetchedAt,
    dataUpdatedAt: TOKYO_FOREIGN_POPULATION_SOURCE.dataUpdatedAt,
    records: [{
      municipalityCode: KITA_CITY.code,
      municipalityName: KITA_CITY.normalizedName,
      targetNationality: KITA_CITY.nationality,
      residentPopulation,
      raw: {
        "地域階層": hierarchy,
        "地域コード": KITA_CITY.code,
        "国・地域(人)": sourceName,
        "ミャンマー": myanmar,
      },
    }],
    coverageNotes: [
      "This is a Resident Basic Register statistic and does not fully represent short-term visitors or people stranded during a crisis.",
      "The cache intentionally includes only the Kita City / Myanmar demonstration row.",
    ],
  };
}

async function replaceJsonAtomically(outputPath: string, value: PopulationCache): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    JSON.parse(await readFile(temporaryPath, "utf8"));
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

/** Download, validate, and atomically replace the bundled cache. */
export async function refreshKitaMyanmarPopulation(options: RefreshOptions = {}): Promise<PopulationCache> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const outputPath = options.outputPath ?? OUTPUT_PATH;
  const response = await fetchImpl(TOKYO_FOREIGN_POPULATION_SOURCE.url, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Tokyo CSV request failed: ${response.status}`);
  const cache = buildKitaMyanmarPopulationCache(await response.text(), tokyoCalendarDate(options.now ?? new Date()));
  await replaceJsonAtomically(outputPath, cache);
  return cache;
}

async function main() {
  const cache = await refreshKitaMyanmarPopulation();
  const record = cache.records[0];
  console.log(`Cached Kita / Myanmar population (${record.residentPopulation}); data date ${cache.dataUpdatedAt}; fetched ${cache.fetchedAt}.`);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
