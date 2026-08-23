import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [, , appDirectory] = process.argv;
if (!appDirectory) {
  throw new Error("usage: validate-dist.mjs <app-directory>");
}

const dist = resolve(appDirectory, "dist");
const configPath = resolve(dist, "server", "wrangler.json");
const config = JSON.parse(await readFile(configPath, "utf8"));

assert.equal(config.main, "index.js");
assert.equal(config.no_bundle, true);
assert.equal(config.assets?.directory, "../client");
await access(resolve(dist, "server", config.main));
await access(resolve(dist, "client"));
await access(resolve(dist, ".openai", "hosting.json"));

process.stdout.write(`Validated deployable and Sites-compatible output: ${dist}\n`);
