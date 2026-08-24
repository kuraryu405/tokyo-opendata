import assert from "node:assert/strict";
import test from "node:test";
import {
  maximumSmokeDurationMs,
  smokeHealth,
} from "./smoke-health.mjs";

const baseUrl = "https://staybridge.example";
const service = "user";
const revision = "sha-123";

function healthyResponse() {
  return new Response(
    JSON.stringify({ status: "ok", service, revision }),
    { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } },
  );
}

function readyResponse() {
  return new Response(
    JSON.stringify({ ok: true, data: { status: "ready" } }),
    { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } },
  );
}

function hangingBodyResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "Cache-Control": "no-store" }),
    json: () => new Promise(() => {}),
  };
}

test("times out a never-resolving health response body and retries", async () => {
  let healthCalls = 0;
  await assert.rejects(
    smokeHealth(baseUrl, service, revision, {
      attempts: 2,
      delayMs: 0,
      requestTimeoutMs: 20,
      fetchImpl: async (url) => {
        assert.equal(url.pathname, "/healthz");
        healthCalls += 1;
        return hangingBodyResponse();
      },
    }),
    /health check failed after 2 attempts: health request timed out after 20ms/,
  );
  assert.equal(healthCalls, 2);
});

test("times out a never-resolving readiness response body and retries", async () => {
  let healthCalls = 0;
  let readinessCalls = 0;
  await assert.rejects(
    smokeHealth(baseUrl, service, revision, {
      attempts: 2,
      delayMs: 0,
      requestTimeoutMs: 20,
      fetchImpl: async (url) => {
        if (url.pathname === "/healthz") {
          healthCalls += 1;
          return healthyResponse();
        }
        assert.equal(url.pathname, "/readyz");
        readinessCalls += 1;
        return hangingBodyResponse();
      },
    }),
    /health check failed after 2 attempts: readiness request timed out after 20ms/,
  );
  assert.equal(healthCalls, 2);
  assert.equal(readinessCalls, 2);
});

test("passes AbortSignals to both requests on a healthy attempt", async () => {
  const signals = [];
  await smokeHealth(baseUrl, service, revision, {
    attempts: 1,
    requestTimeoutMs: 1000,
    fetchImpl: async (url, init) => {
      signals.push(init.signal);
      return url.pathname === "/healthz" ? healthyResponse() : readyResponse();
    },
  });

  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal instanceof AbortSignal));
  assert.ok(signals.every((signal) => !signal.aborted));
});

test("default smoke timeout budget leaves ample room before the 20 minute production job timeout", () => {
  assert.equal(maximumSmokeDurationMs(), 154_000);
  assert.ok(maximumSmokeDurationMs() < 20 * 60 * 1000);
});
