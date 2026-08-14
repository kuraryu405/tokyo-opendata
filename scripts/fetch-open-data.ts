/**
 * Refresh the small, auditable cache used by the demo.
 * Run with: npx tsx scripts/fetch-open-data.ts
 *
 * Only the Tokyo foreign-population CSV is downloaded automatically. Kita's
 * facility sources are curated official pages/PDFs, so they require review
 * before changing normalized records rather than silently scraping a layout.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const csvUrl = "https://www.toukei.metro.tokyo.lg.jp/gaikoku/2026/ga26ev0300.csv";
const outputDirectory = join(process.cwd(), "src/data/normalized");
// `0300` identifies table 3, not a month. Keep the reference date explicit
// and update it only when switching to a separately verified Tokyo release.
const dataUpdatedAt = "2026-01-01";

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted;
    } else if (character === "," && !quoted) { cells.push(cell); cell = ""; } else cell += character;
  }
  cells.push(cell);
  return cells;
}

async function main() {
  const response = await fetch(csvUrl);
  if (!response.ok) throw new Error(`Tokyo CSV request failed: ${response.status}`);
  const csv = (await response.text()).replace(/^\uFEFF/, "");
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const header = parseCsvLine(headerLine);
  const row = lines.map(parseCsvLine).find((cells) => cells[header.indexOf("地域コード")] === "13117");
  if (!row) throw new Error("Kita City (13117) was not found in the Tokyo CSV.");
  const raw = Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""]));
  const myanmar = raw["ミャンマー"];
  if (!/^\d+$/.test(myanmar)) throw new Error("Kita City Myanmar value is not a numeric field.");
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const cached = {
    sourceId: "TOKYO_FOREIGN_POPULATION_2026_01", fetchedAt, dataUpdatedAt,
    records: [{ municipalityCode: "13117", municipalityName: "Kita", targetNationality: "Myanmar", residentPopulation: Number(myanmar), raw: { "地域階層": raw["地域階層"], "地域コード": raw["地域コード"], "国・地域(人)": raw["国・地域(人)"], "ミャンマー": myanmar } }],
    coverageNotes: ["This is a Resident Basic Register statistic and does not fully represent short-term visitors or people stranded during a crisis.", "The cache intentionally includes only the Kita City / Myanmar demonstration row."],
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "kita-myanmar-population.json"), `${JSON.stringify(cached, null, 2)}\n`);
  console.log(`Cached Kita / Myanmar population (${myanmar}); data date ${dataUpdatedAt}; fetched ${fetchedAt}.`);
}

void main();
