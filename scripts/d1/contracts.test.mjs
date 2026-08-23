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

test("only the municipality Worker owns the once-daily Open Data schedule", async () => {
  const municipality = JSON.parse(await readFile("apps/municipality/wrangler.jsonc", "utf8"));
  const user = JSON.parse(await readFile("apps/user/wrangler.jsonc", "utf8"));

  assert.deepEqual(municipality.triggers.crons, ["0 3 * * *"]);
  assert.deepEqual(municipality.env.staging.triggers.crons, ["0 3 * * *"]);
  assert.deepEqual(municipality.env.production.triggers.crons, ["0 3 * * *"]);
  assert.deepEqual(municipality.secrets.required, ["OPEN_DATA_SYNC_SECRET"]);
  assert.deepEqual(municipality.env.staging.secrets.required, ["OPEN_DATA_SYNC_SECRET"]);
  assert.deepEqual(municipality.env.production.secrets.required, ["OPEN_DATA_SYNC_SECRET"]);
  assert.equal(user.triggers, undefined);
  assert.equal(user.env.staging.triggers, undefined);
  assert.equal(user.env.production.triggers, undefined);
  assert.equal(user.secrets, undefined);
  assert.doesNotMatch(JSON.stringify(municipality), /replace-with|expected-secret|secret-value/);
});

test("foundation and Open Data migrations keep the assigned 0001/0003 numbering", async () => {
  const migration = await readFile(
    "database/migrations/0001_backend_foundation.sql",
    "utf8",
  );
  const openDataMigration = await readFile(
    "database/migrations/0003_open_data_cache.sql",
    "utf8",
  );
  const seed = await readFile("database/seed.sql", "utf8");

  assert.match(migration, /CREATE TABLE backend_metadata/);
  assert.match(seed, /ON CONFLICT\(key\) DO UPDATE/);
  assert.match(openDataMigration, /CREATE TABLE open_data_sources/);
  assert.match(openDataMigration, /CREATE TABLE open_data_dataset_versions/);
  assert.match(openDataMigration, /CREATE TABLE open_data_resources/);
  assert.match(openDataMigration, /CREATE TABLE open_data_active_datasets/);
  assert.match(openDataMigration, /CREATE TABLE open_data_import_runs/);
  assert.match(openDataMigration, /row_count >= 50 AND row_count <= 200/);
  assert.match(openDataMigration, /latitude >= 35\.70 AND latitude <= 35\.85/);
  assert.match(openDataMigration, /longitude >= 139\.65 AND longitude <= 139\.85/);
  assert.doesNotMatch(openDataMigration, /raw_csv|raw_body|response_body/i);
  await assert.rejects(readFile("database/migrations/0002_open_data_cache.sql", "utf8"));
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

    await assert.rejects(execFileAsync("pnpm", [
      ...wranglerArgs,
      "execute",
      ...commonArgs,
      "--command",
      "INSERT INTO open_data_dataset_versions (source_id, version_hash, data_updated_at, fetched_at, row_count, status) VALUES ('KITA_EARTHQUAKE_SHELTERS', 'sha256:partial', '2025-09-01', '2026-08-23T00:00:00.000Z', 49, 'staged')",
    ]));

    const resources = Array.from({ length: 50 }, (_, index) => ({
      id: `fixture-shelter-${index}`,
      category: "emergency_shelter",
      municipality: "Kita",
      name: `Fixture shelter ${index}`,
      address: `北区王子${index}-1-1`,
      latitude: 35.72 + index * 0.001,
      longitude: 139.68 + index * 0.002,
    }));
    const fixtureResources = JSON.stringify(resources).replaceAll("'", "''");
    await execFileAsync("pnpm", [
      ...wranglerArgs,
      "execute",
      ...commonArgs,
      "--command",
      `INSERT INTO open_data_dataset_versions (source_id, version_hash, data_updated_at, fetched_at, row_count, status) VALUES ('KITA_EARTHQUAKE_SHELTERS', 'sha256:fixture', '2025-09-01', '2026-08-23T00:00:00.000Z', ${resources.length}, 'staged'); INSERT INTO open_data_resources (dataset_version_id, resource_id, ordinal, category, municipality, name, address, latitude, longitude, description) SELECT version.id, json_extract(item.value, '$.id'), CAST(item.key AS INTEGER), json_extract(item.value, '$.category'), json_extract(item.value, '$.municipality'), json_extract(item.value, '$.name'), json_extract(item.value, '$.address'), json_extract(item.value, '$.latitude'), json_extract(item.value, '$.longitude'), json_extract(item.value, '$.description') FROM json_each('${fixtureResources}') AS item JOIN open_data_dataset_versions AS version ON version.source_id = 'KITA_EARTHQUAKE_SHELTERS' AND version.version_hash = 'sha256:fixture'; UPDATE open_data_dataset_versions SET status = 'active' WHERE version_hash = 'sha256:fixture'; INSERT INTO open_data_active_datasets (source_id, dataset_version_id, activated_at) SELECT source_id, id, '2026-08-23T00:00:00.000Z' FROM open_data_dataset_versions WHERE version_hash = 'sha256:fixture';`,
    ]);

    const { stdout } = await execFileAsync("pnpm", [
      ...wranglerArgs,
      "execute",
      ...commonArgs,
      "--command",
      "SELECT (SELECT COUNT(*) FROM backend_metadata WHERE key = 'seed_version' AND value = '2') AS metadata_count, (SELECT COUNT(*) FROM open_data_sources WHERE source_id = 'KITA_EARTHQUAKE_SHELTERS' AND attribution <> '' AND license_url <> '' AND catalog_url <> '' AND update_frequency <> '' AND landing_page_url <> '' AND landing_page_updated_at = '2026-06-17') AS source_count, (SELECT COUNT(*) FROM open_data_resources WHERE category = 'emergency_shelter' AND municipality = 'Kita') AS resource_count, (SELECT COUNT(*) FROM open_data_active_datasets WHERE source_id = 'KITA_EARTHQUAKE_SHELTERS') AS active_count",
      "--json",
    ]);
    const results = JSON.parse(stdout);
    assert.equal(results[0]?.results?.[0]?.metadata_count, 1);
    assert.equal(results[0]?.results?.[0]?.source_count, 1);
    assert.equal(results[0]?.results?.[0]?.resource_count, resources.length);
    assert.equal(results[0]?.results?.[0]?.active_count, 1);

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
