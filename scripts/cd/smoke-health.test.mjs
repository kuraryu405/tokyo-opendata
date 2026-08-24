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

test("times out a never-resolving fetch even when the custom implementation ignores AbortSignal", async () => {
  const signals = [];
  let calls = 0;

  await assert.rejects(
    smokeHealth(baseUrl, service, revision, {
      attempts: 2,
      delayMs: 0,
      requestTimeoutMs: 20,
      fetchImpl: async (_url, init) => {
        calls += 1;
        signals.push(init.signal);
        return new Promise(() => {});
      },
    }),
    /health check failed after 2 attempts: health request timed out after 20ms/,
  );

  assert.equal(calls, 2);
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal.aborted));
});

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

test("rejects invalid smoke timing configuration before starting requests", async () => {
  const invalidAttempts = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY];
  for (const attempts of invalidAttempts) {
    await assert.rejects(
      smokeHealth(baseUrl, service, revision, {
        attempts,
        delayMs: 0,
        requestTimeoutMs: 10,
        fetchImpl: async () => healthyResponse(),
      }),
      /attempts must be a positive integer/,
    );
  }

  const invalidDelays = [-1, Number.NaN, Number.POSITIVE_INFINITY];
  for (const delayMs of invalidDelays) {
    await assert.rejects(
      smokeHealth(baseUrl, service, revision, {
        attempts: 1,
        delayMs,
        requestTimeoutMs: 10,
        fetchImpl: async () => healthyResponse(),
      }),
      /delayMs must be a non-negative finite number/,
    );
  }

  const invalidTimeouts = [0, -1, Number.NaN, Number.POSITIVE_INFINITY];
  for (const requestTimeoutMs of invalidTimeouts) {
    await assert.rejects(
      smokeHealth(baseUrl, service, revision, {
        attempts: 1,
        delayMs: 0,
        requestTimeoutMs,
        fetchImpl: async () => healthyResponse(),
      }),
      /requestTimeoutMs must be a positive finite number/,
    );
  }
});

test("maximum duration rejects configurations that cannot provide a finite bound", () => {
  assert.throws(
    () => maximumSmokeDurationMs({ attempts: Number.POSITIVE_INFINITY }),
    /attempts must be a positive integer/,
  );
  assert.throws(
    () => maximumSmokeDurationMs({ delayMs: Number.POSITIVE_INFINITY }),
    /delayMs must be a non-negative finite number/,
  );
  assert.throws(
    () => maximumSmokeDurationMs({ requestTimeoutMs: Number.NaN }),
    /requestTimeoutMs must be a positive finite number/,
  );
});

test("default smoke timeout budget leaves ample room before the 20 minute production job timeout", () => {
  assert.equal(maximumSmokeDurationMs(), 154_000);
  assert.ok(maximumSmokeDurationMs() < 20 * 60 * 1000);
});
