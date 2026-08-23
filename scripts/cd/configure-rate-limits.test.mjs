import assert from "node:assert/strict";
import test from "node:test";
import { configureRateLimitNamespaces } from "./configure-rate-limits.mjs";

function userConfig() {
  return {
    ratelimits: [
      {
        name: "PERSISTENCE_RATE_LIMITER",
        namespace_id: "202608230059",
        simple: { limit: 20, period: 60 },
      },
      {
        name: "SUPPORT_CHAT_RATE_LIMITER",
        namespace_id: "202608230020",
        simple: { limit: 20, period: 60 },
      },
    ],
  };
}

test("uses distinct staging and production rate limit namespaces", () => {
  const staging = userConfig();
  const production = userConfig();

  configureRateLimitNamespaces(staging, "user", "staging");
  configureRateLimitNamespaces(production, "user", "production");

  assert.equal(staging.ratelimits[0].namespace_id, "202608230159");
  assert.equal(production.ratelimits[0].namespace_id, "202608230259");
  assert.equal(staging.ratelimits[1].namespace_id, "202608230021");
  assert.equal(production.ratelimits[1].namespace_id, "202608230022");
  assert.notEqual(
    staging.ratelimits[1].namespace_id,
    production.ratelimits[1].namespace_id,
  );
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
