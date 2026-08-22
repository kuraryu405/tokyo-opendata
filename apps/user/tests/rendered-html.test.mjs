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

test("server-renders a neutral shell before client session restoration", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>StayBridge Tokyo<\/title>/i);
  assert.match(html, /StayBridge/);
  assert.doesNotMatch(html, /今の状況を確認する/);
  assert.match(html, /Official information/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/);
});

test("derives absolute social image URLs from the incoming production host", async () => {
  const response = await render("/", "https://staybridge.example");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /property="og:image" content="https:\/\/staybridge\.example\/og\.png"/i);
  assert.match(html, /name="twitter:image" content="https:\/\/staybridge\.example\/og\.png"/i);
  assert.doesNotMatch(html, /localhost:3000\/og\.png/i);
});

test("renders localized facility display values for locale Local Action routes", async () => {
  const [englishResponse, burmeseResponse] = await Promise.all([render("/en/local"), render("/my/local")]);
  assert.equal(englishResponse.status, 200);
  assert.equal(burmeseResponse.status, 200);

  const [english, burmese] = await Promise.all([englishResponse.text(), burmeseResponse.text()]);
  assert.match(english, /Toyokawa Elementary School/);
  assert.match(english, /3-10-23 Toshima, Kita City, Tokyo/);
  assert.doesNotMatch(english, /豊川小学校/);
  assert.match(burmese, /တိုယိုကာဝါ မူလတန်းကျောင်း/);
  assert.match(burmese, /တိုကျို၊ ကီတာမြို့နယ်၊ တိုယိုရှီမာ ၃-၁၀-၂၃/);
  assert.doesNotMatch(burmese, /豊川小学校/);
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
