import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/", origin = "http://localhost") {
  const requestOrigin = new URL(origin);
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}-${origin}`);
  const { default: worker } = await import(workerUrl.href);

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

async function callBuiltWorker(request) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}-${request.method}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(request, {
    STAYBRIDGE_DB: {},
    PERSISTENCE_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    IMAGES: { input() { throw new Error("Image binding should not be used during API tests"); } },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("redirects the root URL to the slashless Japanese landing route in one step", async () => {
  const response = await render("/");
  assert.ok(response.status >= 300 && response.status < 400);
  assert.equal(new URL(response.headers.get("location") ?? "", "http://localhost").pathname, "/ja");
});

test("migrates legacy root screen query URLs without dropping their state", async () => {
  const checkResponse = await render("/?screen=check&step=4");
  assert.ok(checkResponse.status >= 300 && checkResponse.status < 400);
  assert.equal(
    new URL(checkResponse.headers.get("location") ?? "", "http://localhost").pathname,
    "/ja/check",
  );
  assert.equal(new URL(checkResponse.headers.get("location") ?? "", "http://localhost").search, "?step=4");

  const localResponse = await render("/?screen=local&filter=medical");
  assert.ok(localResponse.status >= 300 && localResponse.status < 400);
  assert.equal(
    new URL(localResponse.headers.get("location") ?? "", "http://localhost").pathname,
    "/ja/local",
  );
  assert.equal(new URL(localResponse.headers.get("location") ?? "", "http://localhost").search, "?filter=medical");
});

test("server-renders the StayBridge landing page with its route locale on html", async () => {
  const response = await render("/ja");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>StayBridge Tokyo<\/title>/i);
  assert.match(html, /<html[^>]+lang="ja"/i);
  assert.match(html, /StayBridge/);
  assert.match(html, /今の状況を確認する/);
  assert.match(html, /Official information/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/);
});

test("server-renders each reviewed locale with its SSR html lang", async () => {
  for (const [pathname, locale] of [["/ja", "ja"], ["/en", "en"], ["/my", "my"]]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(await response.text(), new RegExp(`<html[^>]+lang="${locale}"`, "i"));
  }
});

test("derives absolute social image URLs from the incoming production host", async () => {
  const response = await render("/ja", "https://staybridge.example");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /property="og:image" content="https:\/\/staybridge\.example\/og\.png"/i);
  assert.match(html, /name="twitter:image" content="https:\/\/staybridge\.example\/og\.png"/i);
  assert.doesNotMatch(html, /localhost:3000\/og\.png/i);
});

test("links to the municipality app through the local default URL", async () => {
  const response = await render("/ja");
  const html = await response.text();
  assert.match(html, /href="http:\/\/localhost:3001"/i);
});

test("server-renders each URL-driven reviewed route", async () => {
  for (const pathname of [
    "/ja",
    "/en/check?step=4",
    "/my/status",
    "/ja/roadmap",
    "/en/local?filter=medical",
    "/my/help",
    "/ja/summary",
  ]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(await response.text(), /StayBridge/);
  }
});

test("keeps the Situation save action out of SSR until the client validates a complete session", async () => {
  const response = await render("/ja/status");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /次のステップを準備しています/);
  assert.doesNotMatch(html, /同意して保存/);
});

test("redirects a legacy trailing-slash landing URL to its slashless canonical URL", async () => {
  for (const pathname of ["/ja/", "/en/", "/my/"]) {
    const response = await render(pathname);
    assert.ok(response.status >= 300 && response.status < 400, pathname);
    assert.equal(
      new URL(response.headers.get("location") ?? "", "http://localhost").pathname,
      pathname.slice(0, -1),
      pathname,
    );
  }
});

test("redirects draft locales and invalid route queries canonically", async () => {
  const draftResponse = await render("/zh-CN/check?step=3");
  assert.ok(draftResponse.status >= 300 && draftResponse.status < 400);
  assert.equal(new URL(draftResponse.headers.get("location") ?? "", "http://localhost").pathname, "/ja/check");
  assert.equal(new URL(draftResponse.headers.get("location") ?? "", "http://localhost").search, "?step=3");

  const invalidResponse = await render("/ja/local?filter=not-a-filter");
  assert.ok(invalidResponse.status >= 300 && invalidResponse.status < 400);
  assert.equal(new URL(invalidResponse.headers.get("location") ?? "", "http://localhost").pathname, "/ja/local");
  assert.equal(new URL(invalidResponse.headers.get("location") ?? "", "http://localhost").search, "?filter=all");
});

test("redirects the legacy crisis path to the municipality app", async () => {
  const response = await render("/crisis");
  assert.ok([307, 308].includes(response.status));
  assert.equal(response.headers.get("location"), "http://localhost:3001/");
});

test("routes the compiled Worker persistence API without exposing a conversation list", async () => {
  const listResponse = await callBuiltWorker(new Request("https://staybridge.example/api/conversations"));
  assert.equal(listResponse.status, 405);
  assert.equal(listResponse.headers.get("allow"), "DELETE");

  const publicConversationPost = await callBuiltWorker(new Request(
    "https://staybridge.example/api/conversations",
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
  ));
  assert.equal(publicConversationPost.status, 405);
  assert.equal(publicConversationPost.headers.get("allow"), "DELETE");

  const wrongTypeResponse = await callBuiltWorker(new Request(
    "https://staybridge.example/api/situation-submissions",
    { method: "POST", body: "{}" },
  ));
  assert.equal(wrongTypeResponse.status, 415);

  const generatedConfig = JSON.parse(await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"));
  assert.equal(generatedConfig.ratelimits[0].name, "PERSISTENCE_RATE_LIMITER");
  assert.deepEqual(generatedConfig.ratelimits[0].simple, { limit: 20, period: 60 });
});

test("removes disposable starter assets and keeps site metadata", async () => {
  const [layout, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /StayBridge Tokyo/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
});
