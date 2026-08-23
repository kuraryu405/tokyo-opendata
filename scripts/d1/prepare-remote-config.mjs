import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { configureD1Binding } from "../cd/configure-d1.mjs";

export function createRemoteD1Config(environment, databaseId) {
  const config = {
    name: `staybridge-database-${environment}`,
    compatibility_date: "2026-05-15",
    d1_databases: [
      {
        binding: "STAYBRIDGE_DB",
        database_name: "staybridge-local",
        database_id: "00000000-0000-4000-8000-000000000001",
        migrations_dir: "../../database/migrations",
        remote: false,
      },
    ],
  };

  return configureD1Binding(config, environment, databaseId);
}

async function main(environment, databaseId) {
  if (!environment || !databaseId) {
    throw new Error(
      "usage: prepare-remote-config.mjs <staging|production> <database-id>",
    );
  }

  const outputDirectory = resolve(".wrangler/d1");
  const outputPath = resolve(outputDirectory, `${environment}.json`);
  const config = createRemoteD1Config(environment, databaseId);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`Prepared ignored ${environment} D1 configuration.\n`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  await main(...process.argv.slice(2));
}
