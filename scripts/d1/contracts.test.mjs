import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createRemoteD1Config } from "./prepare-remote-config.mjs";

const execFileAsync = promisify(execFile);

const appConfigs = [
  "apps/user/wrangler.jsonc",
  "apps/municipality/wrangler.jsonc",
];
const placeholderIds = new Set([
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
]);

test("both app Workers share the environment-separated D1 contract", async () => {
  for (const path of appConfigs) {
    const config = JSON.parse(await readFile(path, "utf8"));
    const local = config.d1_databases[0];
    const staging = config.env.staging.d1_databases[0];
    const production = config.env.production.d1_databases[0];

    assert.equal(config.compatibility_date, "2026-05-15");
    assert.equal(local.binding, "STAYBRIDGE_DB");
    assert.equal(local.database_name, "staybridge-local");
    assert.equal(local.remote, false);
    assert.equal(staging.binding, "STAYBRIDGE_DB");
    assert.equal(staging.database_name, "staybridge-staging");
    assert.equal(production.binding, "STAYBRIDGE_DB");
    assert.equal(production.database_name, "staybridge-production");
    assert.equal(
      new Set([
        local.database_id,
        staging.database_id,
        production.database_id,
      ]).size,
      3,
    );
    assert.ok(placeholderIds.has(local.database_id));
    assert.ok(placeholderIds.has(staging.database_id));
    assert.ok(placeholderIds.has(production.database_id));
  }

  const userConfig = JSON.parse(await readFile("apps/user/wrangler.jsonc", "utf8"));
  const rateLimitSets = [
    userConfig.ratelimits,
    userConfig.env.staging.ratelimits,
    userConfig.env.production.ratelimits,
  ];
  const persistenceRateLimits = rateLimitSets.map((limits) => {
    const rateLimit = limits.find((item) => item.name === "PERSISTENCE_RATE_LIMITER");
    assert.ok(rateLimit, "PERSISTENCE_RATE_LIMITER must be configured in every environment");
    return rateLimit;
  });
  const assistantRateLimits = rateLimitSets.map((limits) => {
    const rateLimit = limits.find((item) => item.name === "VERIFIED_ASSISTANT_RATE_LIMITER");
    assert.ok(rateLimit, "VERIFIED_ASSISTANT_RATE_LIMITER must be configured in every environment");
    return rateLimit;
  });
  for (const rateLimit of persistenceRateLimits) {
    assert.deepEqual(rateLimit.simple, { limit: 20, period: 60 });
  }
  for (const rateLimit of assistantRateLimits) {
    assert.deepEqual(rateLimit.simple, { limit: 10, period: 60 });
  }
  assert.equal(new Set(persistenceRateLimits.map((item) => item.namespace_id)).size, 3);
  assert.equal(new Set(assistantRateLimits.map((item) => item.namespace_id)).size, 3);
  assert.equal(userConfig.ai?.binding, "AI");
});

test("only the municipality Worker owns the Open Data sync trigger and secret contract", async () => {
  const userConfig = JSON.parse(await readFile("apps/user/wrangler.jsonc", "utf8"));
  const municipalityConfig = JSON.parse(await readFile("apps/municipality/wrangler.jsonc", "utf8"));

  assert.equal(userConfig.triggers, undefined);
  assert.equal(userConfig.secrets, undefined);
  for (const config of [municipalityConfig, municipalityConfig.env.staging, municipalityConfig.env.production]) {
    assert.deepEqual(config.triggers?.crons, ["0 3 * * *"]);
    assert.deepEqual(config.secrets?.required, ["OPEN_DATA_SYNC_SECRET"]);
  }
});

test("foundation migration and seed remain feature-neutral and idempotent", async () => {
  const migration = await readFile(
    "database/migrations/0001_backend_foundation.sql",
    "utf8",
  );
  const seed = await readFile("database/seed.sql", "utf8");

  assert.match(migration, /CREATE TABLE backend_metadata/);
  assert.match(seed, /ON CONFLICT\(key\) DO UPDATE/);
  assert.doesNotMatch(`${migration}\n${seed}`, /situation|chat|crisis|open.data/i);
});

test("consented persistence uses separated tables, hashed credentials, and no automatic expiry", async () => {
  const migration = await readFile(
    "database/migrations/0002_consented_persistence.sql",
    "utf8",
  );

  assert.match(migration, /CREATE TABLE situation_submissions/);
  assert.match(migration, /CREATE TABLE conversations/);
  assert.match(migration, /CREATE TABLE conversation_messages/);
  assert.match(migration, /deletion_token_hash/);
  assert.match(migration, /idempotency_key_hash/);
  assert.doesNotMatch(migration, /expires_at|raw_content|user_id|cookie/i);
});

test("applies migrations and an idempotent seed to an empty local D1", async () => {
  const persistTo = await mkdtemp(join(tmpdir(), "staybridge-d1-contract-"));
  const wranglerArgs = [
    "exec",
    "wrangler",
    "d1",
  ];
  const commonArgs = [
    "STAYBRIDGE_DB",
    "--local",
    "--config",
    "apps/user/wrangler.jsonc",
    "--persist-to",
    persistTo,
  ];

  try {
    await execFileAsync("pnpm", [
      ...wranglerArgs,
      "migrations",
      "apply",
      ...commonArgs,
    ]);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await execFileAsync("pnpm", [
        ...wranglerArgs,
        "execute",
        ...commonArgs,
        "--file",
        "database/seed.sql",
        "--yes",
      ]);
    }

    const { stdout } = await execFileAsync("pnpm", [
      ...wranglerArgs,
      "execute",
      ...commonArgs,
      "--command",
      "SELECT COUNT(*) AS count FROM backend_metadata WHERE key = 'seed_version' AND value = '1'",
      "--json",
    ]);
    const results = JSON.parse(stdout);
    assert.equal(results[0]?.results?.[0]?.count, 1);

    const { stdout: schemaStdout } = await execFileAsync("pnpm", [
      ...wranglerArgs,
      "execute",
      ...commonArgs,
      "--command",
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('situation_submissions', 'conversations', 'conversation_messages')",
      "--json",
    ]);
    const schemaResults = JSON.parse(schemaStdout);
    assert.equal(schemaResults[0]?.results?.[0]?.count, 3);
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
});

test("prepares an ignored remote operations config without a placeholder", () => {
  const config = createRemoteD1Config(
    "staging",
    "12345678-1234-1234-1234-123456789abc",
  );

  assert.equal(config.d1_databases[0].binding, "STAYBRIDGE_DB");
  assert.equal(config.d1_databases[0].database_name, "staybridge-staging");
  assert.equal(
    config.d1_databases[0].database_id,
    "12345678-1234-1234-1234-123456789abc",
  );
  assert.equal(config.d1_databases[0].migrations_dir, "../../database/migrations");
});
