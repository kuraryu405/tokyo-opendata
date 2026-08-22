import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DEFAULT_WORKERS = {
  user_staging_worker: "staybridge-user-staging",
  user_production_worker: "staybridge-user-production",
  municipality_staging_worker: "staybridge-municipality-staging",
  municipality_production_worker: "staybridge-municipality-production",
};

function requireWorkerName(value, key) {
  const worker = value || DEFAULT_WORKERS[key];
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(worker)) {
    throw new Error(`Invalid Worker name for ${key}: ${worker}`);
  }
  return worker;
}

export function resolveReleaseConfig({ workersSubdomain, workers = {} }) {
  const subdomain = workersSubdomain?.trim() ?? "";
  if (!subdomain) {
    throw new Error(
      "CLOUDFLARE_WORKERS_SUBDOMAIN repository variable must be configured before deployment.",
    );
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
    throw new Error(`Invalid CLOUDFLARE_WORKERS_SUBDOMAIN: ${subdomain}`);
  }

  const result = {};
  for (const key of Object.keys(DEFAULT_WORKERS)) {
    const worker = requireWorkerName(workers[key], key);
    result[key] = worker;
    result[key.replace(/_worker$/, "_verification_url")] =
      `https://${worker}.${subdomain}.workers.dev`;
  }
  return result;
}

function writeOutputs(configuration) {
  const lines = `${Object.entries(configuration)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, lines);
  } else {
    process.stdout.write(lines);
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  writeOutputs(
    resolveReleaseConfig({
      workersSubdomain: process.env.CLOUDFLARE_WORKERS_SUBDOMAIN,
      workers: {
        user_staging_worker: process.env.USER_STAGING_WORKER,
        user_production_worker: process.env.USER_PRODUCTION_WORKER,
        municipality_staging_worker:
          process.env.MUNICIPALITY_STAGING_WORKER,
        municipality_production_worker:
          process.env.MUNICIPALITY_PRODUCTION_WORKER,
      },
    }),
  );
}
