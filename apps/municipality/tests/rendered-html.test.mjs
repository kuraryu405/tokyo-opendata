import assert from "node:assert/strict";
import test from "node:test";

async function loadBuiltWorker(key) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${key}`);
  return (await import(workerUrl.href)).default;
}

async function render(pathname = "/", origin = "http://localhost", database, withEnvironment = true) {
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
    withEnvironment ? {
      STAYBRIDGE_DB: database ?? { prepare: () => ({ bind: () => ({ first: async () => ({ respondent_count: 0, last_updated_at: null }) }) }) },
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      IMAGES: {
        input() {
          throw new Error("Image binding should not be used during page rendering");
        },
      },
    } : undefined,
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("built municipality Worker owns the verified facility API and manual sync route without a schedule", async () => {
  const worker = await loadBuiltWorker("open-data-worker-contract");
  assert.equal(worker.scheduled, undefined);

  const resources = await render(
    "/api/open-data/resources?municipality=Kita&category=medical",
    "http://localhost",
    undefined,
    false,
  );
  const body = await resources.json();
  assert.equal(resources.status, 200);
  assert.equal(body.data.origin, "bundled");
  assert.equal(body.data.resources.length, 3);

  const sync = await render("/internal/open-data/sync", "http://localhost", undefined, false);
  assert.equal(sync.status, 405);
  assert.equal(sync.headers.get("allow"), "POST");
});

test("server-renders the Japanese support-preparation view at the municipality root", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /自治体・支援者向け確認画面/);
  assert.match(html, /人口データについて/);
  assert.match(html, /公開情報をもとに整理しています/);
  assert.match(html, /個人が特定される情報は表示しません/);
  assert.match(html, /短期滞在者の地域分布/);
  assert.match(html, /掲載施設は、空き状況・予約状況・受け入れ余力までは示していません/);
  assert.doesNotMatch(html, /Preparedness View|Data coverage note|Situation Check|公開データのキャッシュ|個人追跡・住所レベル表示・法的判断を行いません/);
  assert.doesNotMatch(html, /Resident population statistics|The cached lists identify facilities|Language support is not uniformly published|Real-time service availability is unavailable/);
  assert.doesNotMatch(html, /MVP|VERIFIED CACHE|DATA GAP|POTENTIAL IMPACT|VOLUNTARY STAYBRIDGE RESPONSES|NOT OFFICIAL OPEN DATA/);
  assert.match(html, /今回集計している対象/);
  assert.doesNotMatch(html, /aria-label="対象国籍"/);
  assert.match(html, /短期滞在者など/);
  assert.match(html, /対応検討項目/);
  assert.doesNotMatch(html, /type="checkbox"/);
  assert.match(html, /施設データの出典とライセンス/);
  assert.match(html, /Creative Commons Attribution 4.0 International/);
  assert.match(html, /https:\/\/creativecommons\.org\/licenses\/by\/4\.0\//);
  assert.match(html, /東京都北区Open DataをStayBridge用に一部選定・正規化しています/);
  assert.match(html, /東京都北区/);
  assert.match(html, /https:\/\/www\.city\.kita\.lg\.jp\/city-information\/disclosure\/1014461\.html/);
  assert.match(html, /取得日\s*(?:<!-- -->\s*)*2026-08-23/);
  assert.match(html, /crisis-official-data/);
  assert.match(html, /crisis-voluntary-needs/);
  assert.match(html, /匿名集計を確認しています/);
  assert.match(html, /href="http:\/\/localhost:3000"/i);
});

test("serves the built municipality Worker crisis aggregate route before app rendering", async () => {
  const queries = [];
  const database = {
    prepare(query) {
      queries.push(query);
      return {
        bind() { return this; },
        async first() { return { respondent_count: 5, last_updated_at: "2026-08-23T10:00:00.000Z" }; },
        async all() { return { results: [{ category: "medical", respondent_count: 5 }] }; },
      };
    },
  };
  const response = await render("/api/crisis/needs?municipality=13117&period=30d&view=needs", "http://localhost", database);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.availability, "available");
  assert.equal(body.data.respondentCount, 5);
  assert.equal(body.data.hasSuppressedCategories, false);
  assert.deepEqual(body.data.categories, [{ key: "medical", respondentCount: 5 }]);
  assert.ok(queries.every((query) => !/conversation/i.test(query)));
});

test("serves the built municipality root without a D1 binding", async () => {
  const response = await render("/", "http://localhost", undefined, false);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /支援準備の確認画面/);
});

test("returns a generic 503 from the built Crisis API without a D1 binding", async () => {
  const response = await render("/api/crisis/needs?municipality=13117&period=30d&view=needs", "http://localhost", undefined, false);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: { code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable." },
  });
});
