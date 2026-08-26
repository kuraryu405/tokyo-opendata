import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildKitaMyanmarPopulationCache,
  parsePopulationCsv,
  updateOpenDataCaches,
} from "../scripts/fetch-open-data";
import type { VerifiedKitaFacilityDataset } from "../src/kita-facility-connector";

const validPopulationCsv = [
  "\uFEFF地域階層,地域コード,国・地域(人),総数,ミャンマー",
  "0,13000,東京都総数,783701,39198",
  "4,13117,北区,35296,3540",
].join("\r\n");

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("open-data fetch pipeline", () => {
  it("parses BOM, quoted commas, escaped quotes, and embedded newlines", () => {
    expect(parsePopulationCsv('\uFEFFa,b\r\n"x,y","escaped ""value"""\r\n"two\nlines",ok\r\n')).toEqual([
      ["a", "b"],
      ["x,y", 'escaped "value"'],
      ["two\nlines", "ok"],
    ]);
  });

  it("builds the validated Kita/Myanmar population cache", () => {
    expect(buildKitaMyanmarPopulationCache(validPopulationCsv, "2026-08-25")).toMatchObject({
      sourceId: "TOKYO_FOREIGN_POPULATION_2026_01",
      dataUpdatedAt: "2026-01-01",
      fetchedAt: "2026-08-25",
      records: [{
        municipalityCode: "13117",
        municipalityName: "北区",
        targetNationality: "Myanmar",
        residentPopulation: 3540,
        raw: {
          "地域階層": "4",
          "地域コード": "13117",
          "国・地域(人)": "北区",
          "ミャンマー": "3540",
        },
      }],
    });
  });

  it.each([
    ["missing required header", validPopulationCsv.replace(",ミャンマー", ",別の列"), "exactly one ミャンマー"],
    ["duplicate required header", validPopulationCsv.replace("総数,ミャンマー", "ミャンマー,ミャンマー"), "exactly one ミャンマー"],
    ["unclosed quote", `${validPopulationCsv}\r\n"broken`, "unclosed quote"],
    ["shifted row", validPopulationCsv.replace("35296,3540", "35296"), "columns; expected"],
    ["missing target row", validPopulationCsv.replace("13117", "13118"), "exactly one Kita City"],
    ["duplicate target row", `${validPopulationCsv}\r\n4,13117,北区,35296,3540`, "exactly one Kita City"],
    ["wrong municipality", validPopulationCsv.replace("北区", "板橋区"), "does not identify Kita City"],
    ["wrong hierarchy", validPopulationCsv.replace("4,13117", "3,13117"), "does not identify Kita City"],
    ["negative population", validPopulationCsv.replace("3540", "-1"), "non-negative integer"],
    ["decimal population", validPopulationCsv.replace("3540", "35.4"), "non-negative integer"],
    ["unsafe population", validPopulationCsv.replace("3540", "9007199254740992"), "safe integer range"],
  ])("rejects %s", (_name, csv, message) => {
    expect(() => buildKitaMyanmarPopulationCache(csv, "2026-08-25")).toThrow(message);
  });

  // Facility selection/validation itself lives in the verified connector
  // (kita-facility-connector.test.ts). At this seam the dataset is already
  // trusted, so the cache must carry it through untouched.
  const facilityDataset: VerifiedKitaFacilityDataset = {
    datasetKey: "KITA_LOCAL_FACILITIES",
    datasetVersion: "sha256:test-digest",
    sourceUpdatedAt: "2024-10-31",
    sourceDates: { KITA_MEDICAL_INSTITUTIONS_OPEN_DATA: "2024-10-31" },
    fetchedAt: "2026-08-25T00:00:00.000Z",
    resources: [{
      id: "kita-medical-oji-kids",
      name: "おうじキッズクリニック",
      category: "medical",
      municipality: "Kita",
      sourceId: "KITA_MEDICAL_INSTITUTIONS_OPEN_DATA",
      dataUpdatedAt: "2024-10-31",
    }],
  };

  it("carries connector-verified facility rows into the resource cache", async () => {
    const directory = await mkdtemp(join(tmpdir(), "staybridge-data-fetch-"));
    temporaryDirectories.push(directory);

    const result = await updateOpenDataCaches({
      populationCsv: validPopulationCsv,
      facilityDataset,
      fetchedAt: "2026-08-25",
    }, { outputDirectory: directory });

    expect(result.resourceCache.fetchedAt).toBe("2026-08-25");
    expect(result.resourceCache.resources).toEqual(facilityDataset.resources);
    expect(JSON.parse(await readFile(join(directory, "kita-myanmar-population.json"), "utf8"))).toEqual(result.populationCache);
    expect(JSON.parse(await readFile(join(directory, "kita-local-resources.json"), "utf8"))).toEqual(result.resourceCache);
  });

  it("writes population and facility caches only after all validation succeeds", async () => {
    const directory = await mkdtemp(join(tmpdir(), "staybridge-data-fetch-"));
    temporaryDirectories.push(directory);

    const result = await updateOpenDataCaches({
      populationCsv: validPopulationCsv,
      facilityDataset,
      fetchedAt: "2026-08-25",
    }, { outputDirectory: directory });

    expect(result.populationCache.records[0]?.residentPopulation).toBe(3540);
    expect(JSON.parse(await readFile(join(directory, "kita-myanmar-population.json"), "utf8"))).toEqual(result.populationCache);
  });

  it("preserves both last-known-good caches when population validation fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "staybridge-data-fetch-"));
    temporaryDirectories.push(directory);
    const populationPath = join(directory, "kita-myanmar-population.json");
    const resourcesPath = join(directory, "kita-local-resources.json");
    await writeFile(populationPath, "last-known-good-population", "utf8");
    await writeFile(resourcesPath, "last-known-good-resources", "utf8");

    await expect(updateOpenDataCaches({
      populationCsv: validPopulationCsv.replace("35296,3540", "35296"),
      facilityDataset,
      fetchedAt: "2026-08-25",
    }, { outputDirectory: directory })).rejects.toThrow("columns; expected");

    expect(await readFile(populationPath, "utf8")).toBe("last-known-good-population");
    expect(await readFile(resourcesPath, "utf8")).toBe("last-known-good-resources");
  });
});
