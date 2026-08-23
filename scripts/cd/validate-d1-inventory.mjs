import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDER_PATTERN = /^00000000-0000-4000-8000-00000000000[1-3]$/;
const EXPECTED_DATABASES = [
  ["staging", "staybridge-staging"],
  ["production", "staybridge-production"],
];

function normalizeConfiguredId(databaseId, environment) {
  if (!UUID_PATTERN.test(databaseId) || PLACEHOLDER_PATTERN.test(databaseId)) {
    throw new Error(
      `A non-placeholder ${environment} D1 database ID must be configured.`,
    );
  }
  return databaseId.toLowerCase();
}

export function parseD1Inventory(contents) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error("Wrangler D1 inventory is not valid JSON.", {
      cause: error,
    });
  }
}

export function validateD1Inventory(
  inventory,
  stagingDatabaseId,
  productionDatabaseId,
) {
  if (!Array.isArray(inventory)) {
    throw new Error("Wrangler D1 inventory must be a JSON array.");
  }

  const configuredIds = {
    staging: normalizeConfiguredId(stagingDatabaseId, "staging"),
    production: normalizeConfiguredId(productionDatabaseId, "production"),
  };
  if (configuredIds.staging === configuredIds.production) {
    throw new Error("Staging and production must not use the same D1 database.");
  }

  const databases = inventory.map((database) => {
    if (
      !database ||
      typeof database !== "object" ||
      Array.isArray(database) ||
      typeof database.uuid !== "string" ||
      !UUID_PATTERN.test(database.uuid) ||
      typeof database.name !== "string" ||
      database.name.length === 0
    ) {
      throw new Error("Wrangler D1 inventory contains a malformed database entry.");
    }
    return { uuid: database.uuid.toLowerCase(), name: database.name };
  });

  for (const [environment, expectedName] of EXPECTED_DATABASES) {
    const configuredId = configuredIds[environment];
    const idMatches = databases.filter(
      (database) => database.uuid === configuredId,
    );
    const nameMatches = databases.filter(
      (database) => database.name === expectedName,
    );

    if (idMatches.length !== 1 || nameMatches.length !== 1) {
      throw new Error(
        `Wrangler D1 inventory must contain exactly one ${expectedName} database matching the configured ${environment} ID.`,
      );
    }
    if (
      idMatches[0].name !== expectedName ||
      nameMatches[0].uuid !== configuredId
    ) {
      throw new Error(
        `The configured ${environment} D1 database ID does not map to ${expectedName}.`,
      );
    }
  }
}

async function main(inventoryPath, stagingDatabaseId, productionDatabaseId) {
  if (!inventoryPath || !stagingDatabaseId || !productionDatabaseId) {
    throw new Error(
      "usage: validate-d1-inventory.mjs <inventory-json> <staging-id> <production-id>",
    );
  }
  const inventory = parseD1Inventory(await readFile(inventoryPath, "utf8"));
  validateD1Inventory(inventory, stagingDatabaseId, productionDatabaseId);
  process.stdout.write("Verified staging and production D1 identities.\n");
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  await main(...process.argv.slice(2));
}
