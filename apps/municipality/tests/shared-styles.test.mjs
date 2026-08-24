import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("keeps shared tokens and primitives in one canonical stylesheet", async () => {
  const [shared, user, municipality] = await Promise.all([
    read("../../../packages/ui/styles.css"),
    read("../../user/app/globals.css"),
    read("../app/globals.css"),
  ]);

  assert.match(user, /@import ["']@staybridge\/ui\/styles\.css["'];/);
  assert.match(municipality, /@import ["']@staybridge\/ui\/styles\.css["'];/);
  assert.match(shared, /--ink: #142c38/);
  assert.match(shared, /\.brand-mark \{/);
  assert.match(shared, /\.count-icon \{/);
  assert.doesNotMatch(user, /--ink:\s*#/);
  assert.doesNotMatch(municipality, /--ink:\s*#/);
  assert.doesNotMatch(user, /(^|\n)\.brand-mark\s*\{/);
  assert.doesNotMatch(municipality, /(^|\n)\.brand-mark\s*\{/);
  assert.doesNotMatch(user, /(^|\n)\.count-icon\s*\{/);
  assert.doesNotMatch(municipality, /(^|\n)\.count-icon\s*\{/);
});
