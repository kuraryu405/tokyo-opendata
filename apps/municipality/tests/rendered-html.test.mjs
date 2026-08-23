import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadBuiltWorker(key) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${key}`);
  return (await import(workerUrl.href)).default;
}

async function render(pathname = "/", origin = "http://localhost") {
  const requestOrigin = new URL(origin);
  const worker = await loadBuiltWorker(`${pathname}-${origin}`);

  return worker.fetch(
    new Request(`${origin}${pathname}`, {
      headers: {
        accept: "text/html",
        host: requestOrigin.host,
        "x-forwarded-proto": requestOrigin.protocol.slice(0, -1),
      },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      IMAGES: {
        input() {
          throw new Error("Image binding should not be used during page rendering");
        },
      },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("built municipality Worker owns the protected sync route and scheduled handler", async () => {
  const worker = await loadBuiltWorker("open-data-worker-contract");
  assert.equal(typeof worker.scheduled, "function");
  const response = await worker.fetch(
    new Request("http://localhost/internal/open-data/sync", { method: "GET" }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("municipality Worker has no verified-assistant route, AI binding, or assistant rate limit", async () => {
  const [source, configText] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"),
  ]);
  const config = JSON.parse(configText);
  assert.doesNotMatch(source, /verified-assistant|handleVerifiedAssistant|\.AI\b/i);
  assert.equal(config.ai, undefined);
  assert.equal(config.ratelimits?.some((item) => item.name === "VERIFIED_ASSISTANT_RATE_LIMITER"), false);
});

test("server-renders the Japanese Preparedness View at the municipality root", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Preparedness View/);
  assert.match(html, /Data coverage note/);
  assert.match(html, /MVPで確認できる固定対象/);
  assert.doesNotMatch(html, /aria-label="対象国籍"/);
  assert.match(html, /短期滞在中の旅行者/);
  assert.match(html, /対応検討項目/);
  assert.match(html, /href="http:\/\/localhost:3000"/i);
});
