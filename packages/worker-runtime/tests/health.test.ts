import assert from "node:assert/strict";
import test from "node:test";
import {
  createApiErrorResponse,
  createApiSuccessResponse,
  createHealthResponse,
  createMethodNotAllowedResponse,
  createReadinessResponse,
} from "../src/index";

test("returns the immutable user release health contract", async () => {
  const response = createHealthResponse({ APP_REVISION: "abc123" }, "user");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "user",
    revision: "abc123",
  });
});

test("uses a safe local revision fallback", async () => {
  const response = createHealthResponse(undefined, "municipality");

  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "municipality",
    revision: "local",
  });
});

test("uses one envelope for successful API responses", async () => {
  const response = createApiSuccessResponse({ value: 1 });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, data: { value: 1 } });
});

test("uses one envelope for input and method errors", async () => {
  const inputResponse = createApiErrorResponse(
    { code: "INVALID_REQUEST", message: "The request is invalid." },
    400,
  );
  const methodResponse = createMethodNotAllowedResponse();

  assert.deepEqual(await inputResponse.json(), {
    ok: false,
    error: { code: "INVALID_REQUEST", message: "The request is invalid." },
  });
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get("allow"), "GET");
  assert.deepEqual(await methodResponse.json(), {
    ok: false,
    error: {
      code: "METHOD_NOT_ALLOWED",
      message: "Only GET is supported for this endpoint.",
    },
  });
});

type ReadinessTable = {
  columns: readonly string[];
  uniqueIndexes?: readonly (readonly string[])[];
  foreignKeys?: readonly { column: string; referencedTable: string; referencedColumn: string }[];
};

function readinessDatabase(schema: Record<string, ReadinessTable>) {
  const indexes = new Map<string, readonly string[]>();
  for (const [table, contract] of Object.entries(schema)) {
    for (const [index, columns] of (contract.uniqueIndexes ?? []).entries()) {
      indexes.set(`fixture_${table}_${index}`, columns);
    }
  }
  return {
    prepare: (query: string) => {
      const tableInfo = /^PRAGMA table_info\('([^']+)'\)$/.exec(query);
      if (tableInfo) {
        const table = tableInfo[1];
        return {
          all: async () => ({ results: (schema[table]?.columns ?? []).map((name) => ({ name })) }),
        };
      }
      const indexList = /^PRAGMA index_list\('([^']+)'\)$/.exec(query);
      if (indexList) {
        const table = indexList[1];
        return {
          all: async () => ({
            results: (schema[table]?.uniqueIndexes ?? []).map((_, index) => ({
              name: `fixture_${table}_${index}`,
              unique: 1,
            })),
          }),
        };
      }
      const indexInfo = /^PRAGMA index_info\('([^']+)'\)$/.exec(query);
      if (indexInfo) {
        const columns = indexes.get(indexInfo[1]) ?? [];
        return {
          all: async () => ({ results: columns.map((name, seqno) => ({ name, seqno })) }),
        };
      }
      const foreignKeyList = /^PRAGMA foreign_key_list\('([^']+)'\)$/.exec(query);
      if (foreignKeyList) {
        const table = foreignKeyList[1];
        return {
          all: async () => ({
            results: (schema[table]?.foreignKeys ?? []).map((foreignKey, id) => ({
              id,
              seq: 0,
              table: foreignKey.referencedTable,
              from: foreignKey.column,
              to: foreignKey.referencedColumn,
            })),
          }),
        };
      }
      throw new Error(`unexpected readiness query: ${query}`);
    },
  } as unknown as D1Database;
}

const openDataSchema = {
  open_data_sources: {
    columns: [
      "source_id", "title", "publisher", "source_url", "catalog_url", "license", "license_url",
      "terms_url", "attribution", "update_frequency", "coverage_note", "data_updated_at", "fetched_at",
      "created_at", "updated_at",
    ],
    uniqueIndexes: [["source_id"]],
  },
  open_data_dataset_versions: {
    columns: [
      "id", "dataset_key", "version_hash", "source_updated_at", "fetched_at",
      "row_count", "status", "created_at",
    ],
    uniqueIndexes: [["dataset_key", "version_hash"], ["dataset_key", "id"]],
  },
  open_data_resources: {
    columns: [
      "dataset_version_id", "resource_id", "ordinal", "category", "municipality",
      "name", "address", "latitude", "longitude", "phone", "website", "source_id", "data_updated_at",
    ],
    uniqueIndexes: [["dataset_version_id", "resource_id"], ["dataset_version_id", "ordinal"]],
    foreignKeys: [
      { column: "dataset_version_id", referencedTable: "open_data_dataset_versions", referencedColumn: "id" },
      { column: "source_id", referencedTable: "open_data_sources", referencedColumn: "source_id" },
    ],
  },
  open_data_active_datasets: {
    columns: ["dataset_key", "dataset_version_id", "activated_at"],
    uniqueIndexes: [["dataset_key"]],
    foreignKeys: [
      { column: "dataset_key", referencedTable: "open_data_dataset_versions", referencedColumn: "dataset_key" },
      { column: "dataset_version_id", referencedTable: "open_data_dataset_versions", referencedColumn: "id" },
    ],
  },
  open_data_import_runs: {
    columns: [
      "run_id", "dataset_key", "started_at", "finished_at", "status", "dry_run",
      "version_hash", "row_count", "error_code",
    ],
    uniqueIndexes: [["run_id"]],
  },
} as const;

const municipalitySchema = {
  ...openDataSchema,
  backend_metadata: { columns: ["key", "value", "updated_at"] },
  situation_submissions: {
    columns: [
      "id", "consent_version", "consented_at", "municipality_code", "visit_purpose",
      "departure_window", "return_status", "family_age_groups_json", "accommodation",
      "needs_json", "japanese_level", "deletion_token_hash", "idempotency_key_hash",
      "payload_hash", "created_at",
    ],
    uniqueIndexes: [["idempotency_key_hash"]],
  },
} as const;

const userSchema = {
  ...municipalitySchema,
  conversations: {
    columns: [
      "id", "consent_version", "consented_at", "model_id", "deletion_token_hash",
      "idempotency_key_hash", "payload_hash", "created_at",
    ],
    uniqueIndexes: [["idempotency_key_hash"]],
  },
  conversation_messages: {
    columns: [
      "id", "conversation_id", "message_index", "role", "masked_content", "source_ids_json", "created_at",
    ],
    uniqueIndexes: [["conversation_id", "message_index"]],
    foreignKeys: [{ column: "conversation_id", referencedTable: "conversations", referencedColumn: "id" }],
  },
} as const;

test("reports schema-complete user readiness through the success envelope", async () => {
  const response = await createReadinessResponse(
    { STAYBRIDGE_DB: readinessDatabase(userSchema) },
    "user",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: { status: "ready" },
  });
});

test("reports an empty database as not ready", async () => {
  const response = await createReadinessResponse(
    { STAYBRIDGE_DB: readinessDatabase({}) },
    "user",
  );

  assert.equal(response.status, 503);
});

test("keeps user conversation tables out of the municipality readiness contract", async () => {
  const database = readinessDatabase(municipalitySchema);
  const userResponse = await createReadinessResponse(
    { STAYBRIDGE_DB: database },
    "user",
  );
  const municipalityResponse = await createReadinessResponse(
    { STAYBRIDGE_DB: database },
    "municipality",
  );

  assert.equal(userResponse.status, 503);
  assert.equal(municipalityResponse.status, 200);
  assert.deepEqual(await municipalityResponse.json(), {
    ok: true,
    data: { status: "ready" },
  });
});

test("requires the Open Data migration for both service readiness contracts", async () => {
  const preOpenDataSchema = {
    backend_metadata: municipalitySchema.backend_metadata,
    situation_submissions: municipalitySchema.situation_submissions,
  };
  for (const service of ["user", "municipality"] as const) {
    const response = await createReadinessResponse(
      { STAYBRIDGE_DB: readinessDatabase(preOpenDataSchema) },
      service,
    );
    assert.equal(response.status, 503, service);
  }
});

test("rejects a partially migrated table with a missing required column", async () => {
  const response = await createReadinessResponse(
    {
      STAYBRIDGE_DB: readinessDatabase({
        backend_metadata: municipalitySchema.backend_metadata,
        situation_submissions: { columns: ["id"] },
      }),
    },
    "municipality",
  );
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.deepEqual(JSON.parse(body), {
    ok: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "The service is temporarily unavailable.",
    },
  });
  assert.doesNotMatch(body, /situation_submissions|created_at|PRAGMA/);
});

test("rejects a schema without the migration's unique or foreign-key constraints", async () => {
  const withoutSubmissionUnique = {
    ...municipalitySchema,
    situation_submissions: { ...municipalitySchema.situation_submissions, uniqueIndexes: [] },
  };
  const withoutMessageUnique = {
    ...userSchema,
    conversation_messages: { ...userSchema.conversation_messages, uniqueIndexes: [] },
  };
  const withoutMessageForeignKey = {
    ...userSchema,
    conversation_messages: { ...userSchema.conversation_messages, foreignKeys: [] },
  };

  for (const [schema, service] of [
    [withoutSubmissionUnique, "municipality"],
    [withoutMessageUnique, "user"],
    [withoutMessageForeignKey, "user"],
  ] as const) {
    const response = await createReadinessResponse(
      { STAYBRIDGE_DB: readinessDatabase(schema) },
      service,
    );
    assert.equal(response.status, 503, service);
    assert.doesNotMatch(await response.text(), /UNIQUE|foreign|conversation|idempotency|PRAGMA/i);
  }
});

test("reports a missing D1 binding as not ready", async () => {
  const response = await createReadinessResponse(undefined, "user");

  assert.equal(response.status, 503);
});

test("does not expose D1 errors or binding identifiers", async () => {
  const response = await createReadinessResponse({
    STAYBRIDGE_DB: {
      prepare: () => {
        throw new Error(
          "SQLITE_ERROR from STAYBRIDGE_DB 11111111-1111-4111-8111-111111111111",
        );
      },
    } as unknown as D1Database,
  }, "user");
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.deepEqual(JSON.parse(body), {
    ok: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "The service is temporarily unavailable.",
    },
  });
  assert.doesNotMatch(body, /SQL|STAYBRIDGE_DB|11111111/);
});
