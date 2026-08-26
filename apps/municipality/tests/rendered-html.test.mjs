import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/", origin = "http://localhost", database, withEnvironment = true, counterpartAppUrl) {
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
    withEnvironment ? {
      STAYBRIDGE_DB: database ?? { prepare: () => ({ bind: () => ({ first: async () => ({ submission_count: 0, last_updated_at: null }) }) }) },
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      IMAGES: {
        input() {
          throw new Error("Image binding should not be used during page rendering");
        },
      },
      ...(counterpartAppUrl ? { COUNTERPART_APP_URL: counterpartAppUrl } : {}),
    } : undefined,
    { waitUntil() {}, passThroughOnException() {} },
  );
}

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
  assert.match(html, /href="\/user"/i);
});

test("uses each request origin for metadata and its runtime user-app redirect", async () => {
  for (const [municipalityOrigin, userOrigin] of [
    ["https://staybridge-municipality-staging.example", "https://staybridge-user-staging.example"],
    ["https://staybridge-municipality-production.example", "https://staybridge-user-production.example"],
  ]) {
    const pageResponse = await render("/", municipalityOrigin);
    assert.equal(pageResponse.status, 200);
    const html = await pageResponse.text();
    assert.match(html, new RegExp(`property="og:image" content="${municipalityOrigin.replaceAll(".", "\\.").replaceAll("/", "\\/")}\\/og\\.png"`, "i"));

    const redirectResponse = await render("/user", municipalityOrigin, undefined, true, userOrigin);
    assert.equal(redirectResponse.status, 307);
    assert.equal(redirectResponse.headers.get("location"), `${userOrigin}/`);
  }

  const missingConfiguration = await render("/user", "https://staybridge-municipality-staging.example");
  assert.equal(missingConfiguration.status, 503);
  assert.equal(missingConfiguration.headers.get("cache-control"), "no-store");
});

test("serves the built municipality Worker crisis aggregate route before app rendering", async () => {
  const queries = [];
  const database = {
    prepare(query) {
      queries.push(query);
      return {
        bind() { return this; },
        async first() { return { submission_count: 5, last_updated_at: "2026-08-23T10:00:00.000Z" }; },
        async all() { return { results: [{ category: "medical", submission_count: 5 }] }; },
      };
    },
  };
  const response = await render("/api/crisis/needs?municipality=13117&period=30d&view=needs", "http://localhost", database);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.availability, "available");
  assert.equal(body.data.submissionCount, 5);
  assert.equal(body.data.hasSuppressedCategories, false);
  assert.deepEqual(body.data.categories, [{ key: "medical", submissionCount: 5 }]);
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
