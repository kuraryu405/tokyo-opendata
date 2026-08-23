import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshBundledKitaShelters } from "../scripts/refresh-kita-shelters";
import {
  assertAllowedKitaShelterSourceUrl,
  buildVerifiedKitaShelterDataset,
  bundledKitaShelterDataset,
  fetchKitaEarthquakeShelters,
  KITA_SHELTER_BOUNDS,
  KITA_SHELTER_HEADERS,
  KITA_SHELTER_MAX_BYTES,
  KITA_SHELTER_MIN_ROWS,
  KITA_SHELTER_TIMEOUT_MS,
} from "../src/kita-shelter-connector";
import { KITA_EARTHQUAKE_SHELTER_SOURCE } from "../src/source-descriptors";
import { sourceRegistry } from "../src/sources";

const fixtureRows = [
  "王子小学校,避難所,東京都,北区王子2-7-1,35.75759391,139.7359642,",
  "豊川小学校,避難所,東京都,北区豊島3-10-23,35.76095902,139.7427823,説明",
  ...Array.from({ length: KITA_SHELTER_MIN_ROWS - 2 }, (_, offset) => {
    const index = offset + 2;
    return `検証避難所${index},避難所,東京都,北区検証${index}-1-1,${35.72 + index * 0.001},${139.68 + index * 0.002},`;
  }),
];

function fixtureCsvBytes(rowCount = KITA_SHELTER_MIN_ROWS): Uint8Array {
  return new TextEncoder().encode(`\uFEFF${KITA_SHELTER_HEADERS.join(",")}\r\n${fixtureRows.slice(0, rowCount).join("\r\n")}\r\n`);
}

const validBytes = fixtureCsvBytes();
const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Kita earthquake shelter connector", () => {
  it("ships a complete normalized fallback with unique stable records", () => {
    expect(bundledKitaShelterDataset.sourceId).toBe(KITA_EARTHQUAKE_SHELTER_SOURCE.id);
    expect(bundledKitaShelterDataset.datasetVersion).toBe("sha256:aa7004efb5903c3d933c8f9a23ad8e3a688378c50b9090694c7a88b9b1a6bc36");
    expect(bundledKitaShelterDataset.resources).toHaveLength(56);
    expect(new Set(bundledKitaShelterDataset.resources.map((resource) => resource.id)).size).toBe(56);
    expect(bundledKitaShelterDataset.resources.every((resource) =>
      resource.category === "emergency_shelter" && resource.municipality === "Kita" &&
      resource.address.startsWith("北区") && Number.isFinite(resource.latitude) && Number.isFinite(resource.longitude) &&
      resource.latitude >= KITA_SHELTER_BOUNDS.minLatitude && resource.latitude <= KITA_SHELTER_BOUNDS.maxLatitude &&
      resource.longitude >= KITA_SHELTER_BOUNDS.minLongitude && resource.longitude <= KITA_SHELTER_BOUNDS.maxLongitude
    )).toBe(true);
    expect(sourceRegistry.KITA_EARTHQUAKE_SHELTERS).toMatchObject({
      url: "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/017/500/hinan_shinsai.csv",
      landingPageUpdatedAt: "2026-06-17",
      dataUpdatedAt: "2025-09-01",
    });
    expect(sourceRegistry.KITA_EARTHQUAKE_SHELTERS.notes).toContain("必ず施設を開設するわけではない");
    expect(sourceRegistry.KITA_EARTHQUAKE_SHELTERS.notes).toContain("北区防災ポータル");
  });

  it("normalizes every source field without inventing operational attributes", async () => {
    const dataset = await buildVerifiedKitaShelterDataset(validBytes, {
      fetchedAt: "2026-08-23T00:00:00.000Z",
      dataUpdatedAt: "2025-09-01",
      etag: '"fixture"',
    });

    expect(dataset.resources).toHaveLength(KITA_SHELTER_MIN_ROWS);
    expect(dataset.resources[0]).toEqual({
      id: expect.stringMatching(/^kita-earthquake-shelter-[0-9a-f]{8}$/),
      name: "王子小学校",
      category: "emergency_shelter",
      municipality: "Kita",
      address: "北区王子2-7-1",
      latitude: 35.75759391,
      longitude: 139.7359642,
      sourceId: KITA_EARTHQUAKE_SHELTER_SOURCE.id,
      dataUpdatedAt: "2025-09-01",
    });
    expect(dataset.resources[1].description).toBe("説明");
    expect(JSON.stringify(dataset.resources)).not.toMatch(/capacity|opening|language/i);
    expect(dataset.datasetVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("accepts only the fixed HTTPS host/path with no query or credentials", () => {
    expect(() => assertAllowedKitaShelterSourceUrl(KITA_EARTHQUAKE_SHELTER_SOURCE.url)).not.toThrow();
    for (const url of [
      `${KITA_EARTHQUAKE_SHELTER_SOURCE.url}?redirect=https://example.com`,
      KITA_EARTHQUAKE_SHELTER_SOURCE.url.replace("www.city.kita.lg.jp", "example.com"),
      KITA_EARTHQUAKE_SHELTER_SOURCE.url.replace("https:", "http:"),
      "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/014/461/hinan_shinsai.csv",
      "https://user:password@www.city.kita.lg.jp/_res/projects/default_project/_page_/001/017/500/hinan_shinsai.csv",
    ]) {
      expect(() => assertAllowedKitaShelterSourceUrl(url)).toThrow("outside the allowlist");
    }
  });

  it("uses fixed GET/manual redirects, validates text/csv, and forwards ETag", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(validBytes, {
      status: 200,
      headers: {
        "content-type": "text/csv",
        "content-length": String(validBytes.byteLength),
        "last-modified": "Mon, 01 Sep 2025 04:32:57 GMT",
        etag: '"fixture"',
      },
    }));
    const result = await fetchKitaEarthquakeShelters({
      fetchImpl,
      etag: '"previous"',
      now: new Date("2026-08-23T00:00:00.000Z"),
    });

    if (result.status !== "validated") throw new Error("Expected a validated fixture response");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(KITA_EARTHQUAKE_SHELTER_SOURCE.url);
    expect(init).toMatchObject({ method: "GET", redirect: "manual", signal: expect.any(AbortSignal) });
    expect(new Headers(init?.headers).get("if-none-match")).toBe('"previous"');
    expect(new Headers(init?.headers).get("accept")).toBe("text/csv");
    expect(result.dataset.dataUpdatedAt).toBe("2025-09-01");
    expect(result.dataset.etag).toBe('"fixture"');
  });

  it("handles 304 without reading or validating a body", async () => {
    const result = await fetchKitaEarthquakeShelters({
      fetchImpl: async () => new Response(null, { status: 304, headers: { etag: '"same"' } }),
      now: new Date("2026-08-23T00:00:00.000Z"),
    });
    expect(result).toEqual({ status: "not_modified", etag: '"same"', fetchedAt: "2026-08-23T00:00:00.000Z" });
  });

  it.each([
    ["redirect", new Response(null, { status: 302, headers: { location: "https://example.com" } }), "redirects are not allowed"],
    ["wrong content type", new Response(validBytes, { status: 200, headers: { "content-type": "text/html" } }), "must use text/csv"],
    ["HTTP failure", new Response(null, { status: 503 }), "request failed: 503"],
    ["declared oversized body", new Response(validBytes, { status: 200, headers: { "content-type": "text/csv", "content-length": String(KITA_SHELTER_MAX_BYTES + 1) } }), "exceeds 1 MiB"],
  ])("rejects %s", async (_name, response, message) => {
    await expect(fetchKitaEarthquakeShelters({ fetchImpl: async () => response })).rejects.toThrow(message);
  });

  it("enforces the overall 30 second timeout", async () => {
    vi.useFakeTimers();
    const promise = fetchKitaEarthquakeShelters({
      fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    });
    const rejection = promise.then(() => undefined, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(KITA_SHELTER_TIMEOUT_MS);
    expect(await rejection).toMatchObject({ name: "AbortError" });
  });

  it("rejects a syntactically valid partial response below the conservative completeness floor", async () => {
    await expect(buildVerifiedKitaShelterDataset(
      fixtureCsvBytes(KITA_SHELTER_MIN_ROWS - 1),
      { fetchedAt: "2026-08-23T00:00:00.000Z" },
    )).rejects.toThrow(`between ${KITA_SHELTER_MIN_ROWS} and 200 data rows`);
  });

  it("rejects junk after a closing quote in an otherwise complete fixture", async () => {
    const malformed = Buffer.from(validBytes).toString("utf8")
      .replace(",139.7359642,\r\n", ',139.7359642,"説明"junk\r\n');
    await expect(buildVerifiedKitaShelterDataset(
      Uint8Array.from(Buffer.from(malformed, "utf8")),
      { fetchedAt: "2026-08-23T00:00:00.000Z" },
    )).rejects.toThrow("junk after a closing quote");
  });

  it("accepts the inclusive Kita-area coordinate boundaries", async () => {
    const raw = Buffer.from(validBytes).toString("utf8")
      .replace("35.75759391", String(KITA_SHELTER_BOUNDS.minLatitude))
      .replace("139.7359642", String(KITA_SHELTER_BOUNDS.minLongitude))
      .replace("35.76095902", String(KITA_SHELTER_BOUNDS.maxLatitude))
      .replace("139.7427823", String(KITA_SHELTER_BOUNDS.maxLongitude));
    const dataset = await buildVerifiedKitaShelterDataset(
      Uint8Array.from(Buffer.from(raw, "utf8")),
      { fetchedAt: "2026-08-23T00:00:00.000Z" },
    );
    expect(dataset.resources[0]).toMatchObject({
      latitude: KITA_SHELTER_BOUNDS.minLatitude,
      longitude: KITA_SHELTER_BOUNDS.minLongitude,
    });
    expect(dataset.resources[1]).toMatchObject({
      latitude: KITA_SHELTER_BOUNDS.maxLatitude,
      longitude: KITA_SHELTER_BOUNDS.maxLongitude,
    });
  });

  it("rejects duplicates, invalid coordinates, excess rows, and oversized fields", async () => {
    const raw = Buffer.from(validBytes).toString("utf8");
    const firstBreak = raw.indexOf("\r\n");
    const secondBreak = raw.indexOf("\r\n", firstBreak + 2);
    const header = raw.slice(0, firstBreak + 2);
    const firstRow = raw.slice(firstBreak + 2, secondBreak + 2);

    await expect(buildVerifiedKitaShelterDataset(
      Uint8Array.from(Buffer.from(`${raw}${firstRow}`, "utf8")),
      { fetchedAt: "2026-08-23T00:00:00.000Z" },
    )).rejects.toThrow("duplicate");
    for (const [from, outside] of [
      ["35.75759391", "35.699999"],
      ["35.75759391", "35.850001"],
      ["139.7359642", "139.649999"],
      ["139.7359642", "139.850001"],
    ]) {
      await expect(buildVerifiedKitaShelterDataset(
        Uint8Array.from(Buffer.from(raw.replace(from, outside), "utf8")),
        { fetchedAt: "2026-08-23T00:00:00.000Z" },
      )).rejects.toThrow("invalid coordinates");
    }
    await expect(buildVerifiedKitaShelterDataset(
      Uint8Array.from(Buffer.from(raw.replace("35.75759391,139.7359642", "0,0"), "utf8")),
      { fetchedAt: "2026-08-23T00:00:00.000Z" },
    )).rejects.toThrow("invalid coordinates");
    await expect(buildVerifiedKitaShelterDataset(
      Uint8Array.from(Buffer.from(header + firstRow.repeat(201), "utf8")),
      { fetchedAt: "2026-08-23T00:00:00.000Z" },
    )).rejects.toThrow("between 50 and 200 data rows");
    await expect(buildVerifiedKitaShelterDataset(
      Uint8Array.from(Buffer.from(raw.replace(firstRow, `${firstRow.slice(0, -2)}${"x".repeat(1025)}\r\n`), "utf8")),
      { fetchedAt: "2026-08-23T00:00:00.000Z" },
    )).rejects.toThrow("exceeds 1 KiB");
  });

  it("atomically replaces the bundled file only after validation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "staybridge-kita-shelters-"));
    temporaryDirectories.push(directory);
    const targetPath = join(directory, "shelters.json");
    await writeFile(targetPath, "last-known-good", "utf8");

    await expect(refreshBundledKitaShelters({
      targetPath,
      fetchImpl: async () => new Response("not csv", { status: 200, headers: { "content-type": "text/plain" } }),
    })).rejects.toThrow("must use text/csv");
    expect(await readFile(targetPath, "utf8")).toBe("last-known-good");

    const dataset = await refreshBundledKitaShelters({
      targetPath,
      now: new Date("2026-08-23T00:00:00.000Z"),
      fetchImpl: async () => new Response(validBytes, { status: 200, headers: { "content-type": "text/csv" } }),
    });
    expect(JSON.parse(await readFile(targetPath, "utf8"))).toEqual(dataset);
  });
});
