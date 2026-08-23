import assert from "node:assert/strict";
import test from "node:test";
import { configureAiBinding } from "./configure-ai-binding.mjs";

test("injects Workers AI only into the user deployment artifact", () => {
  const config = {};

  configureAiBinding(config, "user");

  assert.deepEqual(config.ai, { binding: "AI" });
});

test("keeps the municipality artifact without Workers AI", () => {
  const config = { ai: { binding: "AI", remote: true } };

  configureAiBinding(config, "municipality");

  assert.equal(config.ai, undefined);
});

test("rejects an unknown deployment service", () => {
  assert.throws(
    () => configureAiBinding({}, "unknown"),
    /must be user or municipality/,
  );
});
