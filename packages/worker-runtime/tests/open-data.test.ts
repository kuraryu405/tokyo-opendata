import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  KITA_ELEMENTARY_SCHOOLS_URL,
  KITA_FACILITY_DATASET_KEY,
  KITA_FACILITY_EXPECTED_RESOURCE_COUNT,
  KITA_STANDARD_SELECTIONS,
  type LocalResource,
} from "@staybridge/data";
import type { KitaFacilityFetchOptions } from "@staybridge/data/kita-facility-connector";
import {
  BUNDLED_KITA_FACILITY_DATASET_VERSION,
  createOpenDataResourcesResponse,
  handleOpenDataResourcesRequest,
  handleOpenDataSyncRequest,
  syncKitaFacilityOpenData,
} from "../src/index";

const encoder = new TextEncoder();
const header = ["名称", "住所", "緯度", "経度", "電話番号"];
const csv = (rows: string[][]) => encoder.encode(`${rows.map((row) => row.join(",")).join("\r\n")}\r\n`);
const schoolRows = [
  ["豊川小学校", "東京都北区豊島3丁目10番23号", "35.76", "139.74", "03-0000-0001"],
  ["浮間小学校", "東京都北区浮間3丁目4番27号", "35.78", "139.70", "03-0000-0002"],
  ["十条小学校", "東京都北区中十条3丁目1番6号", "35.77", "139.72", "03-0000-0003"],
  ["西が丘小学校", "東京都北区西が丘1丁目12番14号", "35.77", "139.71", "03-0000-0004"],
];

function standardFiles(): Map<string, Uint8Array> {
  return new Map(Object.entries(KITA_STANDARD_SELECTIONS).map(([filename, selections], fileIndex) => [
    filename,
    csv([header, ...selections.map((selection, rowIndex) => [
      selection.name,
      `東京都北区検証${fileIndex + 1}-${rowIndex + 1}-1`,
      String(35.72 + fileIndex * 0.01 + rowIndex * 0.001),
      String(139.68 + fileIndex * 0.02 + rowIndex * 0.001),
      `03-100${fileIndex}-000${rowIndex}`,
    ])]),
  ]));
}

function fetchOptions(options: {
  partialSchool?: boolean;
  archive?: string;
  lastModified?: string;
} = {}): KitaFacilityFetchOptions {
  const lastModified = options.lastModified ?? "Thu, 31 Oct 2024 02:59:01 GMT";
  return {
    schoolEncoding: "utf-8",
    now: new Date("2026-08-24T00:00:00.000Z"),
    extractZipImpl: () => standardFiles(),
    fetchImpl: async (input) => String(input) === KITA_ELEMENTARY_SCHOOLS_URL
      ? new Response(csv([header, ...(options.partialSchool ? schoolRows.slice(0, -1) : schoolRows)]), {
        headers: { "content-type": "text/csv", "last-modified": lastModified },
      })
      : new Response(options.archive ?? "fixture-archive", {
        headers: { "content-type": "application/zip", "last-modified": lastModified },
      }),
  };
}

type Version = {
  id: number;
  dataset_key: string;
  version_hash: string;
  source_updated_at: string;
  fetched_at: string;
  row_count: number;
  status: string;
};
type StoredResource = {
  resource_id: string;
  category: string;
  municipality: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  source_id: string;
  data_updated_at: string;
};

class StateDatabase {
  versions: Version[] = [];
  resources = new Map<number, StoredResource[]>();
  sources = new Map<string, Record<string, string>>();
  runs = new Map<string, { status: string; error_code?: string }>();
  pointer: number | null = null;
  mutations = 0;
  activationRace = false;
  nextId = 1;

  prepare(query: string) {
    const prepared = {
      query,
      values: [] as unknown[],
      bind: (...values: unknown[]) => { prepared.values = values; return prepared; },
      first: async <T>(column?: string) => this.first(query, prepared.values, column) as T | null,
      all: async <T>() => ({ results: this.all(query, prepared.values) as T[] }),
      run: async () => { this.apply(query, prepared.values); return {}; },
    };
    return prepared;
  }

  async batch(statements: Array<ReturnType<StateDatabase["prepare"]>>) {
    if (this.activationRace && statements.some((item) => item.query.includes("STALE_SYNC"))) {
      const newer: Version = {
        id: 99,
        dataset_key: KITA_FACILITY_DATASET_KEY,
        version_hash: `sha256:${"9".repeat(64)}`,
        source_updated_at: "2026-08-24",
        fetched_at: "2026-08-24T00:00:01.000Z",
        row_count: KITA_FACILITY_EXPECTED_RESOURCE_COUNT,
        status: "active",
      };
      this.versions.push(newer);
      this.resources.set(newer.id, Array.from({ length: KITA_FACILITY_EXPECTED_RESOURCE_COUNT }, () => ({} as StoredResource)));
      this.pointer = newer.id;
      this.activationRace = false;
    }
    for (const statement of statements) await statement.run();
    return [];
  }

  first(query: string, values: unknown[], column?: string): unknown {
    if (query.includes("FROM open_data_active_datasets active")) {
      const version = this.versions.find((item) => item.id === this.pointer);
      if (!version) return null;
      if (!query.includes("AS resource_count")) return { ...version };
      return {
        id: version.id,
        version_hash: version.version_hash,
        source_updated_at: version.source_updated_at,
        row_count: version.row_count,
        resource_count: this.resources.get(version.id)?.length ?? 0,
      };
    }
    if (query.includes("FROM open_data_dataset_versions") && query.includes("version_hash = ?")) {
      const version = this.versions.find((item) => item.dataset_key === values[0] && item.version_hash === values[1]);
      return version ? { id: version.id, row_count: version.row_count, status: version.status } : null;
    }
    if (query.includes("SELECT COUNT(*) AS count FROM open_data_resources")) {
      const count = this.resources.get(Number(values[0]))?.length ?? 0;
      return column ? count : { count };
    }
    throw new Error(`Unexpected first query: ${query}`);
  }

  all(query: string, values: unknown[]): unknown[] {
    if (query.includes("MAX(data_updated_at)")) {
      const dates = new Map<string, string>();
      for (const resource of this.resources.get(Number(values[0])) ?? []) {
        if (!resource.source_id || !resource.data_updated_at) continue;
        const current = dates.get(resource.source_id);
        if (!current || resource.data_updated_at > current) dates.set(resource.source_id, resource.data_updated_at);
      }
      return [...dates].map(([source_id, data_updated_at]) => ({ source_id, data_updated_at }));
    }
    if (query.includes("SELECT resource_id")) return this.resources.get(Number(values[0])) ?? [];
    if (query.includes("FROM open_data_sources")) return [...this.sources.values()];
    throw new Error(`Unexpected all query: ${query}`);
  }

  apply(query: string, values: unknown[]) {
    this.mutations += 1;
    if (query.includes("INSERT INTO open_data_import_runs")) {
      this.runs.set(String(values[0]), { status: "running" });
    } else if (query.includes("INSERT INTO open_data_sources")) {
      const current = this.sources.get(String(values[0]));
      this.sources.set(String(values[0]), {
        source_id: String(values[0]), title: String(values[1]), publisher: String(values[2]),
        source_url: String(values[3]), catalog_url: String(values[4]), license: String(values[5]),
        license_url: String(values[6]), terms_url: String(values[7]), attribution: String(values[8]),
        update_frequency: String(values[9]), coverage_note: String(values[10]),
        data_updated_at: current && current.data_updated_at > String(values[11]) ? current.data_updated_at : String(values[11]),
        fetched_at: current && current.fetched_at > String(values[12]) ? current.fetched_at : String(values[12]),
      });
    } else if (query.includes("INSERT INTO open_data_dataset_versions")) {
      this.versions.push({
        id: this.nextId++, dataset_key: String(values[0]), version_hash: String(values[1]),
        source_updated_at: String(values[2]), fetched_at: String(values[3]), row_count: Number(values[4]), status: "staged",
      });
    } else if (query.includes("INTO open_data_resources")) {
      const version = this.versions.find((item) => item.dataset_key === values[1] && item.version_hash === values[2]);
      if (!version) throw new Error("Missing staged version");
      const existing = new Map((this.resources.get(version.id) ?? []).map((resource) => [resource.resource_id, resource]));
      const rows = (JSON.parse(String(values[0])) as LocalResource[]).map((resource) => {
        const existingDate = existing.get(resource.id)?.data_updated_at;
        return {
          resource_id: resource.id, category: resource.category, municipality: resource.municipality,
          name: resource.name, address: resource.address!, latitude: resource.latitude!, longitude: resource.longitude!,
          phone: resource.phone ?? null, website: resource.website ?? null, source_id: resource.sourceId,
          data_updated_at: existingDate && existingDate > resource.dataUpdatedAt! ? existingDate : resource.dataUpdatedAt!,
        };
      });
      this.resources.set(version.id, rows);
    } else if (query.includes("DELETE FROM open_data_resources")) {
      const version = this.versions.find((item) => item.dataset_key === values[0] && item.version_hash === values[1]);
      if (version) {
        const ids = new Set((JSON.parse(String(values[2])) as LocalResource[]).map((resource) => resource.id));
        this.resources.set(version.id, (this.resources.get(version.id) ?? []).filter((resource) => ids.has(resource.resource_id)));
      }
    } else if (query.includes("UPDATE open_data_resources SET data_updated_at")) {
      const rows = this.resources.get(Number(values[1])) ?? [];
      for (const resource of rows) {
        if (this.pointer === Number(values[4]) && resource.source_id === values[2] && resource.data_updated_at < String(values[0])) {
          resource.data_updated_at = String(values[0]);
        }
      }
    } else if (query.includes("ELSE 'staged' END")) {
      const version = this.versions.find((item) => item.id === Number(values[5]));
      if (version) Object.assign(version, {
        source_updated_at: String(version.source_updated_at) > String(values[0]) ? version.source_updated_at : values[0],
        fetched_at: String(version.fetched_at) > String(values[1]) ? version.fetched_at : values[1],
        row_count: values[2],
        status: this.pointer === Number(values[4]) ? "active" : "staged",
      });
    } else if (query.includes("UPDATE open_data_active_datasets SET")) {
      if (this.pointer === Number(values[3])) this.pointer = Number(values[0]);
    } else if (query.includes("INSERT INTO open_data_active_datasets")) {
      if (this.pointer === null) this.pointer = Number(values[1]);
    } else if (query.includes("SET status = 'inactive'")) {
      if (this.pointer === Number(values[3])) for (const version of this.versions) {
        if (version.dataset_key === values[0] && version.status === "active" && version.id !== Number(values[1])) version.status = "inactive";
      }
    } else if (query.includes("SET status = 'active'")) {
      if (this.pointer === Number(values[2])) {
        const version = this.versions.find((item) => item.id === Number(values[0]));
        if (version) version.status = "active";
      }
    } else if (query.includes("STALE_SYNC")) {
      const run = this.runs.get(String(values[7]));
      if (run) {
        const won = this.pointer === Number(values[2]);
        run.status = won ? (query.includes("THEN 'not_modified'") ? "not_modified" : "succeeded") : "failed";
        if (!won) run.error_code = "STALE_SYNC";
      }
    } else if (query.includes("COALESCE(error_code")) {
      const run = this.runs.get(String(values[1]));
      if (run?.status === "running") { run.status = "failed"; run.error_code = "FETCH_VALIDATE_OR_STORE_FAILED"; }
    } else if (query.includes("SET finished_at = ?, status = ?")) {
      const run = this.runs.get(String(values[4]));
      if (run) run.status = String(values[1]);
    } else if (query.includes("SET source_updated_at = MAX(source_updated_at")) {
      const version = this.versions.find((item) => item.id === Number(values[2]));
      if (version && (values.length < 5 || this.pointer === Number(values[4]))) Object.assign(version, {
        source_updated_at: version.source_updated_at > String(values[0]) ? version.source_updated_at : values[0],
        fetched_at: version.fetched_at > String(values[1]) ? version.fetched_at : values[1],
      });
    } else throw new Error(`Unexpected mutation: ${query}`);
  }
}

function env(database: StateDatabase) {
  return { STAYBRIDGE_DB: database as unknown as D1Database };
}

test("serves the verified bundled cache and allowlisted category filters", async () => {
  const bundleBytes = await readFile(new URL("../../data/src/normalized/kita-local-resources.json", import.meta.url));
  assert.equal(BUNDLED_KITA_FACILITY_DATASET_VERSION, `sha256:${createHash("sha256").update(bundleBytes).digest("hex")}`);
  const response = await handleOpenDataResourcesRequest(
    new Request("https://example.test/api/open-data/resources?municipality=Kita&category=medical"),
    undefined,
  );
  const body = await response.json() as {
    data: { origin: string; datasetVersion: string; sources: Array<Record<string, string>>; resources: LocalResource[] };
  };
  assert.equal(response.status, 200);
  assert.equal(body.data.origin, "bundled");
  assert.match(body.data.datasetVersion, /^sha256:[0-9a-f]{64}$/);
  assert.equal(body.data.sources.length, 3);
  assert.ok(body.data.sources.every((source) =>
    source.sourceId && source.fetchedAt && source.dataUpdatedAt && source.license && source.coverageNote
  ));
  assert.equal(body.data.resources.length, 3);
  assert.ok(body.data.resources.every((resource) => resource.category === "medical"));

  const schools = await handleOpenDataResourcesRequest(
    new Request("https://example.test/api/open-data/resources?municipality=Kita&category=school"),
    undefined,
  );
  assert.equal(((await schools.json()) as { data: { resources: unknown[] } }).data.resources.length, 0);
});

test("rejects unsupported GET methods and every non-allowlisted query shape", async () => {
  for (const url of [
    "https://example.test/api/open-data/resources",
    "https://example.test/api/open-data/resources?municipality=Adachi",
    "https://example.test/api/open-data/resources?municipality=Kita&category=housing",
    "https://example.test/api/open-data/resources?municipality=Kita&category=medical&category=school",
    "https://example.test/api/open-data/resources?municipality=Kita&q=free-form",
  ]) assert.equal((await handleOpenDataResourcesRequest(new Request(url), undefined)).status, 400);
  const method = await handleOpenDataResourcesRequest(new Request(
    "https://example.test/api/open-data/resources?municipality=Kita",
    { method: "POST" },
  ), undefined);
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "GET");
});

test("dry-run validates all 12 selected identities without mutating D1", async () => {
  const database = new StateDatabase();
  const result = await syncKitaFacilityOpenData(env(database), { ...fetchOptions(), dryRun: true });
  assert.deepEqual(result, {
    datasetKey: KITA_FACILITY_DATASET_KEY,
    status: "validated",
    dryRun: true,
    changed: true,
    datasetVersion: result.datasetVersion,
    rowCount: KITA_FACILITY_EXPECTED_RESOURCE_COUNT,
    fetchedAt: "2026-08-24T00:00:00.000Z",
  });
  assert.equal(database.mutations, 0);
});

test("partial current-source data fails without staging or changing the active pointer", async () => {
  const database = new StateDatabase();
  const old: Version = {
    id: 1, dataset_key: KITA_FACILITY_DATASET_KEY, version_hash: `sha256:${"1".repeat(64)}`,
    source_updated_at: "2024-10-31", fetched_at: "2026-08-23T00:00:00.000Z",
    row_count: KITA_FACILITY_EXPECTED_RESOURCE_COUNT, status: "active",
  };
  database.versions.push(old);
  database.resources.set(1, Array.from({ length: KITA_FACILITY_EXPECTED_RESOURCE_COUNT }, () => ({} as StoredResource)));
  database.pointer = 1;
  database.nextId = 2;
  await assert.rejects(syncKitaFacilityOpenData(env(database), { ...fetchOptions({ partialSchool: true }), runId: "partial" }));
  assert.equal(database.pointer, 1);
  assert.equal(database.versions.length, 1);
  assert.deepEqual(database.runs.get("partial"), { status: "failed", error_code: "FETCH_VALIDATE_OR_STORE_FAILED" });
});

test("activates only a fully staged dataset and keeps reruns idempotent", async () => {
  const database = new StateDatabase();
  const first = await syncKitaFacilityOpenData(env(database), { ...fetchOptions(), runId: "first" });
  assert.equal(first.status, "activated");
  assert.equal(database.versions.length, 1);
  assert.equal(database.resources.get(database.pointer!)?.length, KITA_FACILITY_EXPECTED_RESOURCE_COUNT);
  assert.equal(database.runs.get("first")?.status, "succeeded");

  const second = await syncKitaFacilityOpenData(env(database), { ...fetchOptions(), runId: "second" });
  assert.equal(second.status, "not_modified");
  assert.equal(database.versions.length, 1);
  assert.equal(database.resources.get(database.pointer!)?.length, KITA_FACILITY_EXPECTED_RESOURCE_COUNT);
  assert.equal(database.runs.get("second")?.status, "not_modified");

  const older = await syncKitaFacilityOpenData(env(database), {
    ...fetchOptions(),
    now: new Date("2026-08-23T00:00:00.000Z"),
    runId: "older-rerun",
  });
  assert.equal(older.status, "not_modified");
  assert.equal(database.versions[0]?.fetched_at, "2026-08-24T00:00:00.000Z");
  assert.ok([...database.sources.values()].every((source) => source.fetched_at === "2026-08-24T00:00:00.000Z"));

  const response = await createOpenDataResourcesResponse(env(database));
  const body = await response.json() as { data: { origin: string; resources: unknown[]; sources: unknown[] } };
  assert.equal(body.data.origin, "d1");
  assert.equal(body.data.resources.length, KITA_FACILITY_EXPECTED_RESOURCE_COUNT);
  assert.equal(body.data.sources.length, 4);
});

test("repairs corrupt active rows even when the raw dataset hash is unchanged", async () => {
  const database = new StateDatabase();
  await syncKitaFacilityOpenData(env(database), { ...fetchOptions(), runId: "repair-base" });
  database.resources.get(database.pointer!)![0]!.name = "corrupt row";

  const repaired = await syncKitaFacilityOpenData(env(database), { ...fetchOptions(), runId: "repair" });
  assert.equal(repaired.status, "activated");
  assert.equal(database.versions.length, 1);
  assert.equal(database.resources.get(database.pointer!)![0]!.name, "豊川小学校");
  const response = await createOpenDataResourcesResponse(env(database));
  assert.equal((await response.json() as { data: { origin: string } }).data.origin, "d1");
});

test("uses active-pointer CAS so a stale sync cannot overwrite a newer activation", async () => {
  const database = new StateDatabase();
  await syncKitaFacilityOpenData(env(database), { ...fetchOptions({ archive: "old" }), runId: "base" });
  const basePointer = database.pointer;
  database.activationRace = true;
  await assert.rejects(syncKitaFacilityOpenData(env(database), {
    ...fetchOptions({ archive: "slow-stale" }),
    runId: "stale",
  }), /newer facility sync/);
  assert.notEqual(database.pointer, basePointer);
  assert.equal(database.pointer, 99);
  assert.deepEqual(database.runs.get("stale"), { status: "failed", error_code: "STALE_SYNC" });
});

test("does not report not-modified after a concurrent activation replaces its pointer", async () => {
  const database = new StateDatabase();
  await syncKitaFacilityOpenData(env(database), { ...fetchOptions(), runId: "not-modified-base" });
  database.activationRace = true;

  await assert.rejects(syncKitaFacilityOpenData(env(database), {
    ...fetchOptions(),
    runId: "not-modified-stale",
  }), /replaced the not-modified version/);
  assert.equal(database.pointer, 99);
  assert.deepEqual(database.runs.get("not-modified-stale"), { status: "failed", error_code: "STALE_SYNC" });
});

test("rejects a sequentially older valid source before staging or activation", async () => {
  const database = new StateDatabase();
  await syncKitaFacilityOpenData(env(database), {
    ...fetchOptions({ lastModified: "Fri, 01 Aug 2025 00:00:00 GMT" }),
    runId: "newer-source",
  });
  const activePointer = database.pointer;
  const versionCount = database.versions.length;

  await assert.rejects(syncKitaFacilityOpenData(env(database), {
    ...fetchOptions({ archive: "different-but-older", lastModified: "Thu, 31 Oct 2024 02:59:01 GMT" }),
    runId: "older-source",
  }), /older than the active dataset/);
  assert.equal(database.pointer, activePointer);
  assert.equal(database.versions.length, versionCount);
  assert.deepEqual(database.runs.get("older-source"), {
    status: "failed",
    error_code: "FETCH_VALIDATE_OR_STORE_FAILED",
  });
});

test("falls back when D1 is absent, partial, or unavailable", async () => {
  const partial = new StateDatabase();
  partial.versions.push({
    id: 1, dataset_key: KITA_FACILITY_DATASET_KEY, version_hash: `sha256:${"1".repeat(64)}`,
    source_updated_at: "2024-10-31", fetched_at: "2026-08-23T00:00:00.000Z", row_count: 11, status: "active",
  });
  partial.pointer = 1;
  for (const candidate of [
    env(partial),
    { STAYBRIDGE_DB: { prepare() { throw new Error("D1 unavailable"); } } as unknown as D1Database },
    undefined,
  ]) {
    const response = await createOpenDataResourcesResponse(candidate);
    const body = await response.json() as { data: { origin: string; resources: unknown[] } };
    assert.equal(body.data.origin, "bundled");
    assert.equal(body.data.resources.length, 8);
  }
});

test("protects manual sync with a secret and rejects request bodies", async () => {
  let touched = false;
  const database = { prepare() { touched = true; throw new Error("unexpected"); } } as unknown as D1Database;
  const request = (authorization?: string) => new Request("https://example.test/internal/open-data/sync", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
  assert.equal((await handleOpenDataSyncRequest(request(), undefined)).status, 503);
  assert.equal((await handleOpenDataSyncRequest(request(), { STAYBRIDGE_DB: database })).status, 503);
  assert.equal((await handleOpenDataSyncRequest(request("Bearer wrong"), {
    STAYBRIDGE_DB: database, OPEN_DATA_SYNC_SECRET: "expected-secret",
  })).status, 401);
  assert.equal(touched, false);

  const bodyRequest = new Request("https://example.test/internal/open-data/sync", {
    method: "POST",
    headers: { authorization: "Bearer expected-secret" },
    body: "not allowed",
  });
  assert.equal((await handleOpenDataSyncRequest(bodyRequest, {
    STAYBRIDGE_DB: database, OPEN_DATA_SYNC_SECRET: "expected-secret",
  })).status, 400);
  assert.equal(touched, false);
});
