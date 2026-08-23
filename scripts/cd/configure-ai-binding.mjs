import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const USER_SERVICE = "user";
const MUNICIPALITY_SERVICE = "municipality";

export function configureAiBinding(config, service) {
  if (service === USER_SERVICE) {
    config.ai = { binding: "AI" };
    return config;
  }
  if (service === MUNICIPALITY_SERVICE) {
    delete config.ai;
    return config;
  }
  throw new Error("AI deployment service must be user or municipality.");
}

async function main(configPath, service) {
  if (!configPath || !service) {
    throw new Error(
      "usage: configure-ai-binding.mjs <wrangler-json> <user|municipality>",
    );
  }
  const config = JSON.parse(await readFile(configPath, "utf8"));
  configureAiBinding(config, service);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  process.stdout.write(`Configured the ${service} AI binding.\n`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  await main(...process.argv.slice(2));
}
