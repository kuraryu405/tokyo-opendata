import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const namespaces = {
  user: {
    staging: {
      PERSISTENCE_RATE_LIMITER: "202608230159",
      SUPPORT_CHAT_RATE_LIMITER: "202608230021",
      OTHER_ACTIONS_RATE_LIMITER: "20260823005611",
    },
    production: {
      PERSISTENCE_RATE_LIMITER: "202608230259",
      SUPPORT_CHAT_RATE_LIMITER: "202608230022",
      OTHER_ACTIONS_RATE_LIMITER: "20260823005621",
    },
  },
  municipality: {
    staging: {},
    production: {},
  },
};

export function configureRateLimitNamespaces(config, service, environment) {
  const expected = namespaces[service]?.[environment];
  if (!expected) {
    throw new Error(
      "Rate limit deployment target must use user or municipality with staging or production.",
    );
  }

  const rateLimits = config.ratelimits ?? [];
  if (!Array.isArray(rateLimits)) {
    throw new Error("Deployable rate limit bindings must be an array.");
  }
  const actualNames = rateLimits.map((binding) => binding?.name).sort();
  const expectedNames = Object.keys(expected).sort();
  if (
    actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    throw new Error(`Unexpected rate limit bindings for ${service} ${environment}.`);
  }

  for (const binding of rateLimits) {
    binding.namespace_id = expected[binding.name];
  }
  return config;
}

async function main(configPath, service, environment) {
  if (!configPath || !service || !environment) {
    throw new Error(
      "usage: configure-rate-limits.mjs <wrangler-json> <user|municipality> <staging|production>",
    );
  }
  const config = JSON.parse(await readFile(configPath, "utf8"));
  configureRateLimitNamespaces(config, service, environment);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  process.stdout.write(`Configured ${service} ${environment} rate limit namespaces.\n`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  await main(...process.argv.slice(2));
}
