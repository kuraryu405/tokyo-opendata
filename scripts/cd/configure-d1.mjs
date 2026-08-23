import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const BINDING = "STAYBRIDGE_DB";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDER_PATTERN = /^00000000-0000-4000-8000-00000000000[1-3]$/;

export function configureD1Binding(config, environment, databaseId) {
  if (!new Set(["staging", "production"]).has(environment)) {
    throw new Error("D1 deployment environment must be staging or production.");
  }
  if (!UUID_PATTERN.test(databaseId) || PLACEHOLDER_PATTERN.test(databaseId)) {
    throw new Error("A non-placeholder D1 database ID must be configured.");
  }

  const databases = config.d1_databases;
  const database = Array.isArray(databases)
    ? databases.find((candidate) => candidate.binding === BINDING)
    : undefined;
  if (!database) {
    throw new Error("The deployable artifact is missing its backend D1 binding.");
  }

  database.database_name = `staybridge-${environment}`;
  database.database_id = databaseId;
  delete database.preview_database_id;
  delete database.remote;
  return config;
}

async function main(configPath, environment, databaseId) {
  if (!configPath || !environment || !databaseId) {
    throw new Error(
      "usage: configure-d1.mjs <wrangler-json> <staging|production> <database-id>",
    );
  }
  const config = JSON.parse(await readFile(configPath, "utf8"));
  configureD1Binding(config, environment, databaseId);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  process.stdout.write(`Configured the ${environment} D1 binding.\n`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  await main(...process.argv.slice(2));
}
