import assert from "node:assert/strict";
import test from "node:test";
import { createHealthResponse } from "../src/index";

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
