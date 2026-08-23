import assert from "node:assert/strict";
import test from "node:test";
import { configureD1Binding } from "./configure-d1.mjs";

const validDatabaseId = "12345678-1234-1234-1234-123456789abc";

test("injects an environment-specific D1 binding into a deployable config", () => {
  const config = {
    d1_databases: [
      {
        binding: "STAYBRIDGE_DB",
        database_name: "staybridge-local",
        database_id: "00000000-0000-4000-8000-000000000001",
        remote: false,
      },
    ],
  };

  configureD1Binding(config, "staging", validDatabaseId);

  assert.deepEqual(config.d1_databases, [
    {
      binding: "STAYBRIDGE_DB",
      database_name: "staybridge-staging",
      database_id: validDatabaseId,
    },
  ]);
});

test("rejects local placeholders and unknown environments", () => {
  const config = {
    d1_databases: [{ binding: "STAYBRIDGE_DB" }],
  };

  assert.throws(
    () =>
      configureD1Binding(
        config,
        "production",
        "00000000-0000-4000-8000-000000000003",
      ),
    /non-placeholder/,
  );
  assert.throws(
    () => configureD1Binding(config, "local", validDatabaseId),
    /staging or production/,
  );
});
