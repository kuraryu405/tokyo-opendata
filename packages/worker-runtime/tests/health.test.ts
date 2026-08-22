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

test("reports D1 readiness through the success envelope", async () => {
  const response = await createReadinessResponse({
    STAYBRIDGE_DB: {
      prepare: (query: string) => {
        assert.equal(query, "SELECT 1 AS ready");
        return { first: async () => 1 };
      },
    } as unknown as D1Database,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: { status: "ready" },
  });
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
  });
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
