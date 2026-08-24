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

function readinessDatabase(schema: Record<string, readonly string[]>) {
  return {
    prepare: (query: string) => {
      const match = /^PRAGMA table_info\('([^']+)'\)$/.exec(query);
      assert.ok(match, `unexpected readiness query: ${query}`);
      const table = match[1];
      return {
        all: async () => ({ results: (schema[table] ?? []).map((name) => ({ name })) }),
      };
    },
  } as unknown as D1Database;
}

const municipalitySchema = {
  backend_metadata: ["key", "value", "updated_at"],
  situation_submissions: [
    "id", "consent_version", "consented_at", "municipality_code", "visit_purpose",
    "departure_window", "return_status", "family_age_groups_json", "accommodation",
    "needs_json", "japanese_level", "deletion_token_hash", "idempotency_key_hash",
    "payload_hash", "created_at",
  ],
} as const;

const userSchema = {
  ...municipalitySchema,
  conversations: [
    "id", "consent_version", "consented_at", "model_id", "deletion_token_hash",
    "idempotency_key_hash", "payload_hash", "created_at",
  ],
  conversation_messages: [
    "id", "conversation_id", "message_index", "role", "masked_content", "source_ids_json", "created_at",
  ],
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

test("requires only the crisis-needs tables for the municipality service", async () => {
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

test("rejects a partially migrated table with a missing required column", async () => {
  const response = await createReadinessResponse(
    {
      STAYBRIDGE_DB: readinessDatabase({
        backend_metadata: municipalitySchema.backend_metadata,
        situation_submissions: ["id"],
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
