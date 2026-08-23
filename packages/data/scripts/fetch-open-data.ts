/** Refresh reproducible, bundled Open Data caches. Runtime never fetches these URLs. */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { adaptResourceRecord, adaptTokyoForeignPopulation, type RawResourceRecord } from "../src/adapters/open-data";
import type { LocalResource, LocalResourceCategory, LocalResourcesCache, PopulationCache } from "../src/adapters/types";
import { TOKYO_FOREIGN_POPULATION_SOURCE } from "../src/source-descriptors";

const tokyoPopulationUrl = "https://www.toukei.metro.tokyo.lg.jp/gaikoku/2026/ga26ev0300.csv";
const kitaOpenDataPageUrl = "https://www.city.kita.lg.jp/city-information/disclosure/1014461.html";
const kitaElementarySchoolsUrl = "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/syougakkou-2.csv";
const kitaStandardOpenDataUrl = "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hyo-jyun.zip";
const outputDirectory = join(process.cwd(), "src/normalized");
const populationOutputPath = fileURLToPath(new URL("../src/normalized/kita-myanmar-population.json", import.meta.url));
const requiredPopulationHeaders = ["地域階層", "地域コード", "国・地域(人)", "ミャンマー"] as const;
const kitaCity = {
  hierarchy: "4",
  code: "13117",
  sourceName: "北区",
  normalizedName: "Kita",
  nationality: "Myanmar",
} as const;

type RefreshPopulationOptions = {
  fetchImpl?: typeof fetch;
  now?: Date;
  outputPath?: string;
};

type SelectedResource = { id: string; name: string; category: LocalResourceCategory; sourceId: string };

const schoolSelection: SelectedResource[] = [
  { id: "kita-school-toyokawa", name: "豊川小学校", category: "school", sourceId: "KITA_ELEMENTARY_SCHOOLS_OPEN_DATA" },
  { id: "kita-school-ukima", name: "浮間小学校", category: "school", sourceId: "KITA_ELEMENTARY_SCHOOLS_OPEN_DATA" },
  { id: "kita-school-jujodai", name: "十条台小学校", category: "school", sourceId: "KITA_ELEMENTARY_SCHOOLS_OPEN_DATA" },
  { id: "kita-school-nishigaoka", name: "西が丘小学校", category: "school", sourceId: "KITA_ELEMENTARY_SCHOOLS_OPEN_DATA" },
];
const standardSelections: Record<string, SelectedResource[]> = {
  "10_医療機関一覧.csv": [
    { id: "kita-medical-oji-kids", name: "おうじキッズクリニック", category: "medical", sourceId: "KITA_MEDICAL_INSTITUTIONS_OPEN_DATA" },
    { id: "kita-medical-kominato", name: "医療法人社団リボン会小湊小児科医院", category: "medical", sourceId: "KITA_MEDICAL_INSTITUTIONS_OPEN_DATA" },
    { id: "kita-medical-shikada", name: "しかだこどもクリニック", category: "medical", sourceId: "KITA_MEDICAL_INSTITUTIONS_OPEN_DATA" },
  ],
  "05_子育て施設一覧.csv": [
    { id: "kita-child-akabane-kita", name: "赤羽北児童館", category: "child_support", sourceId: "KITA_CHILDCARE_FACILITIES_OPEN_DATA" },
    { id: "kita-child-kamiya", name: "神谷子どもセンター", category: "child_support", sourceId: "KITA_CHILDCARE_FACILITIES_OPEN_DATA" },
    { id: "kita-child-jujodai", name: "十条台子どもセンター", category: "child_support", sourceId: "KITA_CHILDCARE_FACILITIES_OPEN_DATA" },
  ],
  "01_公共施設一覧.csv": [
    { id: "kita-public-akabane-hall", name: "赤羽会館", category: "public_facility", sourceId: "KITA_PUBLIC_FACILITIES_OPEN_DATA" },
    { id: "kita-public-hokutopia", name: "北とぴあ", category: "public_facility", sourceId: "KITA_PUBLIC_FACILITIES_OPEN_DATA" },
  ],
};

/** Parse publisher CSVs strictly enough to reject malformed or shifted rows. */
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

/** Convert the publisher CSV into the one-row population cache after validation. */
export function buildKitaMyanmarPopulationCache(csv: string, fetchedAt: string): PopulationCache {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fetchedAt)) throw new Error("fetchedAt must use YYYY-MM-DD.");
  const [header, ...dataRows] = parseCsv(csv);
  if (!header || dataRows.length === 0) throw new Error("Tokyo CSV has no data rows.");
  const indexes = Object.fromEntries(requiredPopulationHeaders.map((name) => {
    const matches = header.reduce<number[]>((found, value, index) => value === name ? [...found, index] : found, []);
    if (matches.length !== 1) throw new Error(`Tokyo CSV must contain exactly one ${name} column.`);
    return [name, matches[0]];
  })) as Record<(typeof requiredPopulationHeaders)[number], number>;
  dataRows.forEach((candidate, index) => {
    if (candidate.length !== header.length) {
      throw new Error(`Tokyo CSV row ${index + 2} has ${candidate.length} columns; expected ${header.length}.`);
    }
  });
  const matches = dataRows.filter((candidate) => candidate[indexes["地域コード"]] === kitaCity.code);
  if (matches.length !== 1) throw new Error(`Tokyo CSV must contain exactly one Kita City (${kitaCity.code}) row.`);
  const row = matches[0];
  const hierarchy = row[indexes["地域階層"]];
  const sourceName = row[indexes["国・地域(人)"]];
  const myanmar = row[indexes["ミャンマー"]];
  if (hierarchy !== kitaCity.hierarchy || sourceName !== kitaCity.sourceName) {
    throw new Error(`Tokyo CSV row ${kitaCity.code} does not identify Kita City.`);
  }
  if (!/^\d+$/.test(myanmar)) throw new Error("Kita City Myanmar value must be a non-negative integer.");
  const residentPopulation = Number(myanmar);
  if (!Number.isSafeInteger(residentPopulation)) throw new Error("Kita City Myanmar value exceeds the safe integer range.");
  return {
    sourceId: TOKYO_FOREIGN_POPULATION_SOURCE.id,
    fetchedAt,
    dataUpdatedAt: TOKYO_FOREIGN_POPULATION_SOURCE.dataUpdatedAt,
    records: [{
      municipalityCode: kitaCity.code,
      municipalityName: kitaCity.normalizedName,
      targetNationality: kitaCity.nationality,
      residentPopulation,
      raw: {
        "地域階層": hierarchy,
        "地域コード": kitaCity.code,
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

async function replacePopulationCacheAtomically(outputPath: string, value: PopulationCache): Promise<void> {
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

/** Download, validate, and atomically replace the bundled population cache. */
export async function refreshKitaMyanmarPopulation(options: RefreshPopulationOptions = {}): Promise<PopulationCache> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(TOKYO_FOREIGN_POPULATION_SOURCE.url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Tokyo CSV request failed: ${response.status}`);
  const cache = buildKitaMyanmarPopulationCache(await response.text(), tokyoCalendarDate(options.now ?? new Date()));
  await replacePopulationCacheAtomically(options.outputPath ?? populationOutputPath, cache);
  return cache;
}

function csvRecords(text: string): RawResourceRecord[] {
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!header?.length) throw new Error("CSV did not contain a header row.");
  return rows.filter((row) => row.some((cell) => cell.trim())).map((row) => Object.fromEntries(header.map((key, index) => [key.trim(), row[index]?.trim() ?? ""])));
}

function extractZipFiles(archive: Buffer): Map<string, Buffer> {
  const eocdOffset = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset < 0) throw new Error("ZIP end-of-central-directory record was not found.");
  const entries = archive.readUInt16LE(eocdOffset + 10); let offset = archive.readUInt32LE(eocdOffset + 16);
  const filenameDecoder = new TextDecoder("shift_jis"); const files = new Map<string, Buffer>();
  for (let index = 0; index < entries; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error(`ZIP central-directory entry ${index} is invalid.`);
    const method = archive.readUInt16LE(offset + 10), compressedSize = archive.readUInt32LE(offset + 20), filenameLength = archive.readUInt16LE(offset + 28), extraLength = archive.readUInt16LE(offset + 30), commentLength = archive.readUInt16LE(offset + 32), localOffset = archive.readUInt32LE(offset + 42);
    const filename = filenameDecoder.decode(archive.subarray(offset + 46, offset + 46 + filenameLength));
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`ZIP local entry for ${filename} is invalid.`);
    const localFilenameLength = archive.readUInt16LE(localOffset + 26), localExtraLength = archive.readUInt16LE(localOffset + 28), dataOffset = localOffset + 30 + localFilenameLength + localExtraLength;
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    const contents = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : undefined;
    if (!contents) throw new Error(`ZIP compression method ${method} is unsupported for ${filename}.`);
    files.set(filename, contents); offset += 46 + filenameLength + extraLength + commentLength;
  }
  return files;
}

function selectResources(records: RawResourceRecord[], selected: SelectedResource[]): LocalResource[] {
  return selected.map((selection) => {
    const record = records.find((candidate) => candidate["名称"] === selection.name || candidate["施設名"] === selection.name);
    if (!record) throw new Error(`${selection.name} was not found in its verified Open Data dataset.`);
    const resource = adaptResourceRecord(record, { id: selection.id, category: selection.category, municipality: "Kita", sourceId: selection.sourceId });
    if (!resource) throw new Error(`${selection.name} has no usable source name and will not be fabricated.`);
    return resource;
  });
}

async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { "User-Agent": "StayBridgeTokyo-data-refresh/0.1" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const [populationBytes, schoolBytes, standardArchive] = await Promise.all([fetchBytes(tokyoPopulationUrl), fetchBytes(kitaElementarySchoolsUrl), fetchBytes(kitaStandardOpenDataUrl)]);
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const populationRecords = csvRecords(new TextDecoder("utf-8").decode(populationBytes));
  const rawPopulation = populationRecords.find((record) => record["地域コード"] === "13117");
  const myanmar = rawPopulation && adaptTokyoForeignPopulation(rawPopulation);
  if (!rawPopulation || !myanmar) throw new Error("Kita City / Myanmar was not found as a numeric Tokyo population row.");
  const populationCache: PopulationCache = { sourceId: "TOKYO_FOREIGN_POPULATION_2026_01", fetchedAt, dataUpdatedAt: "2026-01-01", records: [{ ...myanmar, raw: { "地域階層": String(rawPopulation["地域階層"] ?? ""), "地域コード": String(rawPopulation["地域コード"] ?? ""), "国・地域(人)": String(rawPopulation["国・地域(人)"] ?? ""), "ミャンマー": String(rawPopulation["ミャンマー"] ?? "") } }], coverageNotes: ["This is a Resident Basic Register statistic and does not fully represent short-term visitors or people stranded during a crisis.", "The cache intentionally includes only the Kita City / Myanmar demonstration row."] };
  const standardFiles = extractZipFiles(standardArchive);
  const resources = [...selectResources(csvRecords(new TextDecoder("shift_jis").decode(schoolBytes)), schoolSelection), ...Object.entries(standardSelections).flatMap(([filename, selection]) => { const file = standardFiles.get(filename); if (!file) throw new Error(`${filename} was not found in the downloaded Kita standard Open Data ZIP.`); return selectResources(csvRecords(new TextDecoder("utf-8").decode(file)), selection); })];
  const resourceCache: LocalResourcesCache = { fetchedAt, resources, coverageNotes: [`Selected from ${kitaOpenDataPageUrl}; facility rows are cached for a stable MVP and are not a complete inventory.`, "A listed facility does not establish eligibility, capacity, language support, appointment availability, or service availability."] };
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([writeFile(join(outputDirectory, "kita-myanmar-population.json"), `${JSON.stringify(populationCache, null, 2)}\n`), writeFile(join(outputDirectory, "kita-local-resources.json"), `${JSON.stringify(resourceCache, null, 2)}\n`)]);
  console.log(`Cached Kita / Myanmar population (${myanmar.residentPopulation}); data date 2026-01-01; fetched ${fetchedAt}.`);
  console.log(`Cached ${resources.length} Kita facility rows from verified CC BY 4.0 Open Data; fetched ${fetchedAt}.`);
}

void main();
