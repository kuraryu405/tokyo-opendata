import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildKitaMyanmarPopulationCache,
  parseCsv,
  refreshKitaMyanmarPopulation,
} from "../scripts/fetch-open-data";
import { TOKYO_FOREIGN_POPULATION_SOURCE } from "../src/data/source-descriptors";
import { sourceRegistry } from "../src/data/sources";

const validCsv = [
  "\uFEFF地域階層,地域コード,国・地域(人),総数,ミャンマー",
  "0,13000,東京都総数,783701,39198",
  "4,13117,北区,35296,3540",
].join("\r\n");

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("open-data fetch pipeline", () => {
  it("parses BOM, quoted commas, and escaped quotes", () => {
    expect(parseCsv('\uFEFFa,b\r\n"x,y","escaped ""value"""\r\n')).toEqual([
      ["a", "b"],
      ["x,y", 'escaped "value"'],
    ]);
  });

  it("builds the one-row cache while keeping source, data, and fetch dates distinct", () => {
    expect(buildKitaMyanmarPopulationCache(validCsv, "2026-08-23")).toMatchObject({
      sourceId: TOKYO_FOREIGN_POPULATION_SOURCE.id,
      dataUpdatedAt: "2026-01-01",
      fetchedAt: "2026-08-23",
      records: [{
        municipalityCode: "13117",
        municipalityName: "Kita",
        targetNationality: "Myanmar",
        residentPopulation: 3540,
        raw: { "地域階層": "4", "地域コード": "13117", "国・地域(人)": "北区", "ミャンマー": "3540" },
      }],
    });
  });

  it.each([
    ["missing required header", validCsv.replace(",ミャンマー", ",別の列"), "exactly one ミャンマー"],
    ["duplicate required header", validCsv.replace("総数,ミャンマー", "ミャンマー,ミャンマー"), "exactly one ミャンマー"],
    ["unclosed quote", `${validCsv}\r\n"broken`, "unclosed quote"],
    ["shifted row", validCsv.replace("35296,3540", "35296"), "columns; expected"],
    ["empty cells row", `${validCsv}\r\n,,`, "columns; expected"],
    ["quoted empty row", `${validCsv}\r\n""`, "columns; expected"],
    ["missing target row", validCsv.replace("13117", "13118"), "exactly one Kita City"],
    ["duplicate target row", `${validCsv}\r\n4,13117,北区,35296,3540`, "exactly one Kita City"],
    ["wrong municipality", validCsv.replace("北区", "板橋区"), "does not identify Kita City"],
    ["negative population", validCsv.replace("3540", "-1"), "non-negative integer"],
    ["decimal population", validCsv.replace("3540", "35.4"), "non-negative integer"],
    ["exponential population", validCsv.replace("3540", "1e3"), "non-negative integer"],
    ["unsafe population", validCsv.replace("3540", "9007199254740992"), "safe integer range"],
  ])("rejects %s", (_name, csv, message) => {
    expect(() => buildKitaMyanmarPopulationCache(csv, "2026-08-23")).toThrow(message);
  });

  it("downloads, validates, and writes a cache using the Tokyo calendar date", async () => {
    const directory = await mkdtemp(join(tmpdir(), "staybridge-data-fetch-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "cache.json");
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(validCsv, { status: 200 }));

    const cache = await refreshKitaMyanmarPopulation({
      fetchImpl,
      now: new Date("2026-08-23T15:30:00.000Z"),
      outputPath,
    });

    expect(fetchImpl).toHaveBeenCalledWith(TOKYO_FOREIGN_POPULATION_SOURCE.url, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(cache.fetchedAt).toBe("2026-08-24");
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(cache);
  });

  it("preserves the last-known-good cache when validation fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "staybridge-data-fetch-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "cache.json");
    await writeFile(outputPath, "last-known-good", "utf8");

    await expect(refreshKitaMyanmarPopulation({
      fetchImpl: async () => new Response("<html>not csv</html>", { status: 200 }),
      outputPath,
    })).rejects.toThrow("no data rows");
    expect(await readFile(outputPath, "utf8")).toBe("last-known-good");
  });

  it("rejects HTTP failures without replacing the cache", async () => {
    const directory = await mkdtemp(join(tmpdir(), "staybridge-data-fetch-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "cache.json");
    await writeFile(outputPath, "last-known-good", "utf8");

    await expect(refreshKitaMyanmarPopulation({
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
      outputPath,
    })).rejects.toThrow("Tokyo CSV request failed: 503");
    expect(await readFile(outputPath, "utf8")).toBe("last-known-good");
  });

  it("keeps the fetch descriptor aligned with the Source Registry", () => {
    expect(sourceRegistry[TOKYO_FOREIGN_POPULATION_SOURCE.id]).toMatchObject(TOKYO_FOREIGN_POPULATION_SOURCE);
  });
});
