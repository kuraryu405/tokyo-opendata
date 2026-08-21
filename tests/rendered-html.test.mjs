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

test("server-renders the StayBridge landing page without starter metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>StayBridge Tokyo<\/title>/i);
  assert.match(html, /StayBridge/);
  assert.match(html, /今の状況を確認する/);
  assert.match(html, /Official information/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/);
});

test("server-renders the Preparedness View and its coverage warning", async () => {
  const response = await render("/crisis");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Preparedness View/);
  assert.match(html, /Data coverage note/);
  assert.match(html, /MVPで確認できる固定対象/);
  assert.doesNotMatch(html, /aria-label="対象国籍"/);
  assert.match(html, /短期滞在中の旅行者/);
  assert.match(html, /対応検討項目/);
});

test("derives absolute social image URLs from the incoming production host", async () => {
  const response = await render("/", "https://staybridge.example");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /property="og:image" content="https:\/\/staybridge\.example\/og\.png"/i);
  assert.match(html, /name="twitter:image" content="https:\/\/staybridge\.example\/og\.png"/i);
  assert.doesNotMatch(html, /localhost:3000\/og\.png/i);
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

test("keeps the mobile navigation viewport-fixed outside the filtered header context", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.site-header \{[^}]*backdrop-filter: none;/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.site-header nav \{[^}]*position: fixed;[^}]*inset: auto 0 0;/);
});
