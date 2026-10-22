import assert from "node:assert/strict";
import test from "node:test";
import { runStagingChecks, validateTargets } from "./check-user-bindings.mjs";

const stagingUrl = "https://staybridge-user-staging.example.com";
const productionUrl = "https://staybridge-user.example.com";
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers });

test("target guard rejects production, ambiguous hosts, and URL tricks before a request", async () => {
  for (const target of [
    productionUrl,
    "https://staybridge-user-staging.example.com.evil.test",
    "https://staybridge-user-staging.example.com/path",
    "http://staybridge-user-staging.example.com",
    "https://user:secret@staybridge-user-staging.example.com",
  ]) {
    assert.throws(() => validateTargets(target, productionUrl));
  }
  assert.throws(() => validateTargets(stagingUrl, ""), /PRODUCTION_URL/);
  let requested = false;
  await assert.rejects(runStagingChecks({
    stagingUrl: productionUrl,
    productionUrl,
    fetchImpl: async () => { requested = true; throw new Error("unexpected"); },
  }));
  assert.equal(requested, false);
});

test("checks public staging success and failure contracts without logging response data", async () => {
  const logs = [];
  const counts = { support: 0, action: 0 };
  const fetchImpl = async (input, init) => {
    assert.equal(init.redirect, "manual");
    assert.ok(String(input).startsWith(stagingUrl));
    const path = new URL(input).pathname;
    if (path === "/healthz") return json({ status: "ok", service: "user", revision: "test" });
    if (path === "/readyz") return json({ ok: true, data: { status: "ready" } });
    assert.equal(init.headers.origin, stagingUrl);
    const raw = String(init.body);
    if (path === "/api/support-chat") {
      if (raw.length > 25_000) return json({ error: "REQUEST_TOO_LARGE" }, 413);
      const body = JSON.parse(raw);
      if (body.messages.length) return json({ reply: "PRIVATE_MODEL_OUTPUT" });
      counts.support += 1;
      return counts.support >= 3
        ? json({ error: "RATE_LIMITED" }, 429, { "retry-after": "60" })
        : json({ error: "INVALID_MESSAGES" }, 400);
    }
    if (path === "/api/recommend-actions") {
      if (raw.length > 2_000) return json({ error: "REQUEST_TOO_LARGE" }, 413);
      const body = JSON.parse(raw);
      if (body.text) return json({ actionIds: ["CONTACT_OFFICIAL_SUPPORT"] });
      counts.action += 1;
      return counts.action >= 3
        ? json({ error: "RATE_LIMITED" }, 429, { "retry-after": "60" })
        : json({ error: "INVALID_TEXT" }, 400);
    }
    throw new Error(`unexpected ${path}`);
  };
  await runStagingChecks({ stagingUrl, productionUrl, fetchImpl, log: (line) => logs.push(line) });
  assert.equal(logs.length, 10);
  assert.ok(logs.every((line) => line.startsWith("PASS ")));
  assert.ok(!logs.join(" ").includes("PRIVATE_MODEL_OUTPUT"));
});

test("rejects redirects and missing bindings without exposing response content", async () => {
  const redirect = async () => new Response(null, { status: 302, headers: { location: productionUrl } });
  await assert.rejects(runStagingChecks({ stagingUrl, productionUrl, fetchImpl: redirect }), /could not be reached/);
  const unavailable = async (input) => new URL(input).pathname === "/healthz"
    ? json({ status: "ok", service: "user", revision: "test" })
    : json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "SECRET_VALUE" } }, 503);
  await assert.rejects(runStagingChecks({ stagingUrl, productionUrl, fetchImpl: unavailable, log: () => {} }), (error) => {
    assert.match(error.message, /D1 readiness.*HTTP 200.*HTTP 503/);
    assert.ok(!error.message.includes("SECRET_VALUE"));
    return true;
  });
});
