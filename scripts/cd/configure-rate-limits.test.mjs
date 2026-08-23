import assert from "node:assert/strict";
import test from "node:test";
import { configureRateLimitNamespaces } from "./configure-rate-limits.mjs";

function userConfig() {
  return {
    ratelimits: [
      {
        name: "SUPPORT_CHAT_RATE_LIMITER",
        namespace_id: "202608230020",
        simple: { limit: 20, period: 60 },
      },
      {
        name: "AI_USER_RATE_LIMITER",
        namespace_id: "20260823005601",
        simple: { limit: 10, period: 60 },
      },
      {
        name: "AI_GLOBAL_RATE_LIMITER",
        namespace_id: "20260823005602",
        simple: { limit: 30, period: 60 },
      },
    ],
  };
}

test("uses distinct staging and production rate limit namespaces", () => {
  const staging = userConfig();
  const production = userConfig();

  configureRateLimitNamespaces(staging, "user", "staging");
  configureRateLimitNamespaces(production, "user", "production");

  assert.deepEqual(
    staging.ratelimits.map(({ name, namespace_id }) => [name, namespace_id]),
    [
      ["SUPPORT_CHAT_RATE_LIMITER", "202608230021"],
      ["AI_USER_RATE_LIMITER", "20260823005611"],
      ["AI_GLOBAL_RATE_LIMITER", "20260823005612"],
    ],
  );
  assert.deepEqual(
    production.ratelimits.map(({ name, namespace_id }) => [name, namespace_id]),
    [
      ["SUPPORT_CHAT_RATE_LIMITER", "202608230022"],
      ["AI_USER_RATE_LIMITER", "20260823005621"],
      ["AI_GLOBAL_RATE_LIMITER", "20260823005622"],
    ],
  );
  for (const stagingBinding of staging.ratelimits) {
    const productionBinding = production.ratelimits.find(({ name }) => name === stagingBinding.name);
    assert.notEqual(stagingBinding.namespace_id, productionBinding.namespace_id, stagingBinding.name);
  }
});

test("keeps municipality deployments free of rate limit bindings", () => {
  const config = {};

  configureRateLimitNamespaces(config, "municipality", "staging");

  assert.equal(config.ratelimits, undefined);
});

test("rejects missing, unknown, or malformed rate limit bindings", () => {
  assert.throws(
    () => configureRateLimitNamespaces({}, "user", "staging"),
    /Unexpected rate limit bindings/,
  );
  assert.throws(
    () => configureRateLimitNamespaces({ ratelimits: {} }, "user", "staging"),
    /must be an array/,
  );
  assert.throws(
    () => configureRateLimitNamespaces(userConfig(), "user", "preview"),
    /must use user or municipality/,
  );
});
