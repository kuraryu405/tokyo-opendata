import assert from "node:assert/strict";
import test from "node:test";
import { KITA_SHELTER_HEADERS, KITA_SHELTER_MIN_ROWS } from "@staybridge/data";
import {
  createOpenDataResourcesResponse,
  handleOpenDataResourcesRequest,
  handleOpenDataSyncRequest,
  syncKitaShelterOpenData,
} from "../src/index";

const fixtureRows = Array.from({ length: KITA_SHELTER_MIN_ROWS }, (_, index) =>
  `検証避難所${index},避難所,東京都,北区検証${index}-1-1,${35.72 + index * 0.001},${139.68 + index * 0.002},`,
);
const validBytes = new TextEncoder().encode(
  `\uFEFF${KITA_SHELTER_HEADERS.join(",")}\r\n${fixtureRows.join("\r\n")}\r\n`,
);
const fixtureVersion = `sha256:${"a".repeat(64)}`;

function streamedSyncRequest(url: string, chunks: Uint8Array[]): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Request(url, {
    method: "POST",
    headers: { authorization: "Bearer expected-secret" },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

type FakeStatement = {
  query: string;
  values: unknown[];
  bind(...values: unknown[]): FakeStatement;
  first<T>(column?: string): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};

function statement(
  query: string,
  behavior: {
    first?: (column?: string) => unknown;
    all?: () => unknown[];
    run?: () => unknown;
  } = {},
): FakeStatement {
  return {
    query,
    values: [],
    bind(...values: unknown[]) {
      this.values = values;
      return this;
    },
    async first<T>(column?: string) {
      return (behavior.first?.(column) ?? null) as T | null;
    },
    async all<T>() {
      return { results: (behavior.all?.() ?? []) as T[] };
    },
    async run() {
      return behavior.run?.() ?? {};
    },
  };
}

test("serves the stable GET contract from D1", async () => {
  const resources = Array.from({ length: KITA_SHELTER_MIN_ROWS }, (_, index) => ({
    resource_id: `shelter-${index}`,
    category: "emergency_shelter",
    municipality: "Kita",
    name: `検証避難所${index}`,
    address: `北区検証${index}-1-1`,
    latitude: 35.72 + index * 0.001,
    longitude: 139.68 + index * 0.002,
    description: null,
  }));
  const db = {
    prepare(query: string) {
      if (query.includes("SELECT s.source_id")) {
        return statement(query, { first: () => ({
          source_id: "KITA_EARTHQUAKE_SHELTERS",
          license: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
          license_url: "https://creativecommons.org/licenses/by/4.0/",
          catalog_url: "https://catalog.data.metro.tokyo.lg.jp/dataset/t131172d0000000005",
          attribution: "避難所一覧（震災対応）, 北区, CC BY 4.0",
          version_id: 7,
          version_hash: fixtureVersion,
          data_updated_at: "2025-09-01",
          fetched_at: "2026-08-23T00:00:00.000Z",
          row_count: KITA_SHELTER_MIN_ROWS,
        }) });
      }
      if (query.includes("SELECT resource_id")) return statement(query, { all: () => resources });
      throw new Error(`Unexpected query: ${query}`);
    },
  } as unknown as D1Database;

  const response = await handleOpenDataResourcesRequest(
    new Request("https://example.test/api/open-data/resources?municipality=Kita&category=emergency_shelter"),
    { STAYBRIDGE_DB: db },
  );
  const body = await response.json() as { ok: boolean; data: {
    sourceId: string;
    datasetVersion: string;
    dataUpdatedAt: string;
    fetchedAt: string;
    license: string;
    licenseUrl: string;
    catalogUrl: string;
    attribution: string;
    origin: string;
    resources: Array<Record<string, unknown>>;
  } };
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual({ ...body.data, resources: undefined }, {
    sourceId: "KITA_EARTHQUAKE_SHELTERS",
    datasetVersion: fixtureVersion,
    dataUpdatedAt: "2025-09-01",
    fetchedAt: "2026-08-23T00:00:00.000Z",
    license: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    catalogUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t131172d0000000005",
    attribution: "避難所一覧（震災対応）, 北区, CC BY 4.0",
    origin: "d1",
    resources: undefined,
  });
  assert.equal(body.data.resources.length, KITA_SHELTER_MIN_ROWS);
  assert.deepEqual(body.data.resources[0], {
    id: "shelter-0",
    name: "検証避難所0",
    category: "emergency_shelter",
    municipality: "Kita",
    address: "北区検証0-1-1",
    latitude: 35.72,
    longitude: 139.68,
    sourceId: "KITA_EARTHQUAKE_SHELTERS",
    dataUpdatedAt: "2025-09-01",
  });
});

test("falls back when an active D1 dataset is below the completeness floor", async () => {
  const db = {
    prepare(query: string) {
      if (query.includes("SELECT s.source_id")) {
        return statement(query, { first: () => ({
          source_id: "KITA_EARTHQUAKE_SHELTERS",
          license: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
          license_url: "https://creativecommons.org/licenses/by/4.0/",
          catalog_url: "https://catalog.data.metro.tokyo.lg.jp/dataset/t131172d0000000005",
          attribution: "避難所一覧（震災対応）, 北区, CC BY 4.0",
          version_id: 7,
          version_hash: fixtureVersion,
          data_updated_at: "2025-09-01",
          fetched_at: "2026-08-23T00:00:00.000Z",
          row_count: KITA_SHELTER_MIN_ROWS - 1,
        }) });
      }
      throw new Error("Partial metadata should be rejected before reading resources");
    },
  } as unknown as D1Database;

  const response = await createOpenDataResourcesResponse({ STAYBRIDGE_DB: db });
  const body = await response.json() as { data: { origin: string; resources: unknown[] } };
  assert.equal(response.status, 200);
  assert.equal(body.data.origin, "bundled");
  assert.equal(body.data.resources.length, 56);
});

test("falls back to the verified bundle when D1 has no active data or read fails", async () => {
  for (const prepare of [
    (_query: string) => statement("none", { first: () => null }),
    (_query: string) => { throw new Error("D1 unavailable"); },
  ]) {
    const response = await createOpenDataResourcesResponse({
      STAYBRIDGE_DB: { prepare } as unknown as D1Database,
    });
    const body = await response.json() as { data: { origin: string; resources: unknown[]; datasetVersion: string } };
    assert.equal(response.status, 200);
    assert.equal(body.data.origin, "bundled");
    assert.equal(body.data.resources.length, 56);
    assert.match(body.data.datasetVersion, /^sha256:[0-9a-f]{64}$/);
  }
});

test("rejects unsupported GET queries and methods", async () => {
  const db = {} as D1Database;
  const invalid = await handleOpenDataResourcesRequest(
    new Request("https://example.test/api/open-data/resources?municipality=Kita&category=school"),
    { STAYBRIDGE_DB: db },
  );
  const method = await handleOpenDataResourcesRequest(
    new Request("https://example.test/api/open-data/resources?municipality=Kita&category=emergency_shelter", { method: "POST" }),
    { STAYBRIDGE_DB: db },
  );
  assert.equal(invalid.status, 400);
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "GET");
});

test("requires the environment secret and a matching bearer token", async () => {
  let databaseTouched = false;
  const db = {
    prepare() {
      databaseTouched = true;
      throw new Error("should not query D1");
    },
  } as unknown as D1Database;
  const request = (authorization?: string) => new Request("https://example.test/internal/open-data/sync", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });

  const missingRuntimeEnv = await handleOpenDataSyncRequest(request(), undefined);
  const missingConfiguration = await handleOpenDataSyncRequest(request(), { STAYBRIDGE_DB: db });
  const missingAuth = await handleOpenDataSyncRequest(request(), { STAYBRIDGE_DB: db, OPEN_DATA_SYNC_SECRET: "expected-secret" });
  const wrongAuth = await handleOpenDataSyncRequest(request("Bearer wrong-secret"), { STAYBRIDGE_DB: db, OPEN_DATA_SYNC_SECRET: "expected-secret" });
  assert.equal(missingRuntimeEnv.status, 503);
  assert.equal(missingConfiguration.status, 503);
  assert.equal(missingAuth.status, 401);
  assert.equal(wrongAuth.status, 401);
  assert.equal(databaseTouched, false);
});

test("dry-run validates the remote fixture without any D1 mutation", async () => {
  let mutations = 0;
  const db = {
    prepare(query: string) {
      return statement(query, {
        first: () => null,
        run: () => { mutations += 1; },
      });
    },
    async batch() {
      mutations += 1;
      return [];
    },
  } as unknown as D1Database;
  const request = streamedSyncRequest(
    "https://example.test/internal/open-data/sync?dry_run=true",
    [],
  );
  assert.notEqual(request.body, null);
  const response = await handleOpenDataSyncRequest(
    request,
    { STAYBRIDGE_DB: db, OPEN_DATA_SYNC_SECRET: "expected-secret" },
    {
      now: new Date("2026-08-23T00:00:00.000Z"),
      fetchImpl: async () => new Response(validBytes, { status: 200, headers: { "content-type": "text/csv" } }),
    },
  );
  const body = await response.json() as { data: {
    sourceId: string;
    status: string;
    dryRun: boolean;
    changed: boolean;
    datasetVersion: string;
    rowCount: number;
    fetchedAt: string;
  } };
  assert.equal(response.status, 200);
  assert.equal(body.data.sourceId, "KITA_EARTHQUAKE_SHELTERS");
  assert.equal(body.data.status, "validated");
  assert.equal(body.data.dryRun, true);
  assert.equal(body.data.changed, true);
  assert.match(body.data.datasetVersion, /^sha256:[0-9a-f]{64}$/);
  assert.equal(body.data.rowCount, KITA_SHELTER_MIN_ROWS);
  assert.equal(body.data.fetchedAt, "2026-08-23T00:00:00.000Z");
  assert.equal(mutations, 0);
});

test("allows a Workerd-style empty stream for real sync and rejects actual body bytes", async () => {
  let databaseTouchedByRejectedRequest = false;
  const rejectedDb = {
    prepare() {
      databaseTouchedByRejectedRequest = true;
      throw new Error("body rejection must happen before D1 access");
    },
  } as unknown as D1Database;
  const rejected = await handleOpenDataSyncRequest(
    streamedSyncRequest(
      "https://example.test/internal/open-data/sync",
      [new TextEncoder().encode("unexpected")],
    ),
    { STAYBRIDGE_DB: rejectedDb, OPEN_DATA_SYNC_SECRET: "expected-secret" },
  );
  assert.equal(rejected.status, 400);
  assert.equal(databaseTouchedByRejectedRequest, false);

  const batches: FakeStatement[][] = [];
  const activeDb = {
    prepare(query: string) {
      return statement(query, {
        first: () => query.includes("SELECT v.id") ? {
          id: 3,
          version_hash: "sha256:active",
          etag: '"active"',
          row_count: 56,
        } : null,
      });
    },
    async batch(statements: FakeStatement[]) {
      batches.push(statements);
      return [];
    },
  } as unknown as D1Database;
  const acceptedRequest = streamedSyncRequest(
    "https://example.test/internal/open-data/sync",
    [],
  );
  assert.notEqual(acceptedRequest.body, null);
  const accepted = await handleOpenDataSyncRequest(
    acceptedRequest,
    { STAYBRIDGE_DB: activeDb, OPEN_DATA_SYNC_SECRET: "expected-secret" },
    { fetchImpl: async () => new Response(null, { status: 304 }) },
  );
  const acceptedBody = await accepted.json() as { data: { status: string; dryRun: boolean } };
  assert.equal(accepted.status, 200);
  assert.equal(acceptedBody.data.status, "not_modified");
  assert.equal(acceptedBody.data.dryRun, false);
  assert.equal(batches.length, 2);
});

test("rejects a large row-count regression relative to the active dataset without mutation", async () => {
  let mutations = 0;
  const db = {
    prepare(query: string) {
      return statement(query, {
        first: () => query.includes("SELECT v.id") ? {
          id: 3,
          version_hash: "sha256:active",
          etag: null,
          row_count: 100,
        } : null,
        run: () => { mutations += 1; },
      });
    },
    async batch() {
      mutations += 1;
      return [];
    },
  } as unknown as D1Database;

  await assert.rejects(syncKitaShelterOpenData(
    { STAYBRIDGE_DB: db },
    {
      dryRun: true,
      now: new Date("2026-08-23T00:00:00.000Z"),
      fetchImpl: async () => new Response(validBytes, { status: 200, headers: { "content-type": "text/csv" } }),
    },
  ), /more than 20% below the active dataset/);
  assert.equal(mutations, 0);
});

test("records 304 as idempotent without staging another dataset", async () => {
  const batches: FakeStatement[][] = [];
  const db = {
    prepare(query: string) {
      return statement(query, {
        first: () => query.includes("SELECT v.id") ? {
          id: 3,
          version_hash: "sha256:active",
          etag: '"active"',
          row_count: 56,
        } : null,
      });
    },
    async batch(statements: FakeStatement[]) {
      batches.push(statements);
      return [];
    },
  } as unknown as D1Database;
  const result = await syncKitaShelterOpenData(
    { STAYBRIDGE_DB: db },
    {
      now: new Date("2026-08-23T00:00:00.000Z"),
      runId: "run-304",
      fetchImpl: async (_url, init) => {
        assert.equal(new Headers(init?.headers).get("if-none-match"), '"active"');
        return new Response(null, { status: 304 });
      },
    },
  );
  assert.equal(result.status, "not_modified");
  assert.equal(result.changed, false);
  assert.equal(batches.length, 2);
  assert.equal(batches.some((batch) => batch.some((item) => item.query.includes("INSERT INTO open_data_resources"))), false);
});

test("keeps the existing active pointer if the transactional switch fails", async () => {
  const state = { activeId: 1, staged: false, failedRunRecorded: false };
  const db = {
    prepare(query: string) {
      return statement(query, {
        first: (column) => {
          if (query.includes("SELECT v.id")) return { id: 1, version_hash: "sha256:old", etag: null, row_count: KITA_SHELTER_MIN_ROWS };
          if (query.includes("SELECT id, row_count, status")) {
            return state.staged ? { id: 2, row_count: KITA_SHELTER_MIN_ROWS, status: "staged" } : null;
          }
          if (column === "count") return state.staged ? KITA_SHELTER_MIN_ROWS : 0;
          return null;
        },
        run: () => {
          if (query.includes("error_code = 'FETCH_VALIDATE_OR_STORE_FAILED'")) state.failedRunRecorded = true;
        },
      });
    },
    async batch(statements: FakeStatement[]) {
      if (statements.some((item) => item.query.includes("INSERT INTO open_data_dataset_versions"))) {
        state.staged = true;
        return [];
      }
      if (statements.some((item) => item.query.includes("INSERT INTO open_data_active_datasets"))) {
        throw new Error("simulated transactional switch failure");
      }
      return [];
    },
  } as unknown as D1Database;

  await assert.rejects(syncKitaShelterOpenData(
    { STAYBRIDGE_DB: db },
    {
      now: new Date("2026-08-23T00:00:00.000Z"),
      runId: "run-failed-switch",
      fetchImpl: async () => new Response(validBytes, { status: 200, headers: { "content-type": "text/csv" } }),
    },
  ), /simulated transactional switch failure/);
  assert.equal(state.staged, true);
  assert.equal(state.activeId, 1);
  assert.equal(state.failedRunRecorded, true);
});
