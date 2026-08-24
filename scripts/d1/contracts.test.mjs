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
  const rateLimits = [
    userConfig.ratelimits[0],
    userConfig.env.staging.ratelimits[0],
    userConfig.env.production.ratelimits[0],
  ];
  for (const rateLimit of rateLimits) {
    assert.equal(rateLimit.name, "PERSISTENCE_RATE_LIMITER");
    assert.deepEqual(rateLimit.simple, { limit: 20, period: 60 });
  }
  assert.equal(new Set(rateLimits.map((item) => item.namespace_id)).size, 3);
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

test("Situation integrity migration separates issued capabilities from accepted contributions", async () => {
  const migration = await readFile(
    "database/migrations/0003_situation_submission_integrity.sql",
    "utf8",
  );

  assert.match(migration, /CREATE TABLE situation_submission_capabilities/);
  assert.match(migration, /contribution_state[\s\S]*accepted[\s\S]*quarantined/);
  assert.match(migration, /capability_nonce_hash/);
  assert.match(migration, /consumed_idempotency_key_hash/);
  assert.doesNotMatch(migration, /user_id|cookie|ip_address|raw_token/i);
});

test("quarantines pre-capability Situation rows when the integrity migration is applied", async () => {
  const persistTo = await mkdtemp(join(tmpdir(), "staybridge-d1-integrity-upgrade-"));
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
      "exec", "wrangler", "d1", "execute", ...commonArgs,
      "--file", "database/migrations/0002_consented_persistence.sql", "--yes",
    ]);
    await execFileAsync("pnpm", [
      "exec", "wrangler", "d1", "execute", ...commonArgs,
      "--command",
      `INSERT INTO situation_submissions (
        id, consent_version, consented_at, municipality_code, visit_purpose,
        departure_window, return_status, family_age_groups_json, accommodation,
        needs_json, japanese_level, deletion_token_hash, idempotency_key_hash,
        payload_hash, created_at
      ) VALUES (
        'sit_11111111-1111-4111-8111-111111111111', 'legacy',
        '2026-08-23T00:00:00.000Z', '13117', 'tourism', 'within_7_days',
        'unknown', '[]', 'hotel', '[]', 'beginner', lower(hex(randomblob(32))),
        lower(hex(randomblob(32))), lower(hex(randomblob(32))), '2026-08-23T00:00:00.000Z'
      )`,
      "--yes",
    ]);
    await execFileAsync("pnpm", [
      "exec", "wrangler", "d1", "execute", ...commonArgs,
      "--file", "database/migrations/0003_situation_submission_integrity.sql", "--yes",
    ]);
    const { stdout } = await execFileAsync("pnpm", [
      "exec", "wrangler", "d1", "execute", ...commonArgs,
      "--command",
      "SELECT contribution_state, capability_nonce_hash FROM situation_submissions",
      "--json",
    ]);
    const results = JSON.parse(stdout);
    assert.deepEqual(results[0]?.results, [{
      contribution_state: "quarantined",
      capability_nonce_hash: null,
    }]);
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
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
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('situation_submissions', 'situation_submission_capabilities', 'conversations', 'conversation_messages')",
      "--json",
    ]);
    const schemaResults = JSON.parse(schemaStdout);
    assert.equal(schemaResults[0]?.results?.[0]?.count, 4);

    const nonceHash = "a".repeat(64);
    const firstIdempotencyHash = "1".repeat(64);
    const secondIdempotencyHash = "2".repeat(64);
    await execFileAsync("pnpm", [
      ...wranglerArgs,
      "execute",
      ...commonArgs,
      "--command",
      `INSERT INTO situation_submission_capabilities (
        nonce_hash, capability_version, scope, expires_at, issued_at,
        consumed_at, consumed_idempotency_key_hash
      ) VALUES (
        '${nonceHash}', 1, 'situation:submit', '2026-08-24T11:00:00.000Z',
        '2026-08-24T10:00:00.000Z', NULL, NULL
      )`,
      "--yes",
    ]);
    for (const idempotencyHash of [firstIdempotencyHash, secondIdempotencyHash]) {
      await execFileAsync("pnpm", [
        ...wranglerArgs,
        "execute",
        ...commonArgs,
        "--command",
        `UPDATE situation_submission_capabilities
         SET consumed_at = '2026-08-24T10:01:00.000Z',
             consumed_idempotency_key_hash = '${idempotencyHash}'
         WHERE nonce_hash = '${nonceHash}'
           AND capability_version = 1
           AND scope = 'situation:submit'
           AND expires_at = '2026-08-24T11:00:00.000Z'
           AND consumed_at IS NULL
           AND consumed_idempotency_key_hash IS NULL
           AND expires_at > '2026-08-24T10:01:00.000Z'`,
        "--yes",
      ]);
    }
    const { stdout: ledgerStdout } = await execFileAsync("pnpm", [
      ...wranglerArgs,
      "execute",
      ...commonArgs,
      "--command",
      `SELECT consumed_idempotency_key_hash FROM situation_submission_capabilities
       WHERE nonce_hash = '${nonceHash}'`,
      "--json",
    ]);
    const ledgerResults = JSON.parse(ledgerStdout);
    assert.equal(
      ledgerResults[0]?.results?.[0]?.consumed_idempotency_key_hash,
      firstIdempotencyHash,
    );
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
