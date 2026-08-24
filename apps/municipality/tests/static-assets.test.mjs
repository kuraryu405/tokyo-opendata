import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test("layout does not load unused Google web fonts", async () => {
  const layout = await readFile(
    fileURLToPath(new URL("../app/layout.tsx", import.meta.url)),
    "utf8",
  );

  assert.ok(!layout.includes("next/font/google"));
  assert.ok(!/Geist/.test(layout));
});

test("body keeps the multilingual font stack", async () => {
  const sharedStyles = await readFile(
    fileURLToPath(new URL("../../../packages/ui/styles.css", import.meta.url)),
    "utf8",
  );
  const bodyRule = sharedStyles.match(/body\s*\{[^}]*\}/);

  assert.ok(bodyRule, "shared UI styles must declare a body rule");
  assert.match(bodyRule[0], /font-family:[^;}]*"Noto Sans JP"/);
});
