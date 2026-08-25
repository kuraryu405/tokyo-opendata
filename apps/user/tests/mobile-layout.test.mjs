import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import test from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const port = 3100;
const testUrl = new URL(process.env.STAYBRIDGE_MOBILE_TEST_URL ?? `http://127.0.0.1:${port}`);
const serverCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

let server;
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(new URL("/ja", testUrl));
      if (response.status < 500) return;
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Mobile layout test server did not start at ${testUrl}`);
}

async function openRoute(context, locale) {
  const page = await context.newPage();
  await page.goto(new URL(`/${locale}`, testUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.locator(".hero-actions .secondary-button").click();
  await page.locator("nav[aria-label] button").first().waitFor();
  return page;
}

async function measureLayout(page, safeAreaInsetBottom) {
  await page.addStyleTag({
    content: `:root { --safe-area-inset-bottom: ${safeAreaInsetBottom}px !important; }`,
  });
  return page.evaluate(() => {
    const nav = document.querySelector("nav[aria-label]");
    const buttons = [...document.querySelectorAll("nav[aria-label] button")];
    const footer = document.querySelector(".site-footer");
    if (!nav || !footer || buttons.length !== 3) throw new Error("Expected mobile navigation landmarks are missing");

    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, document.documentElement.scrollHeight);
    const navRect = nav.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const navStyle = getComputedStyle(nav);

    return {
      viewport: { width: innerWidth, height: innerHeight },
      nav: {
        top: navRect.top,
        bottom: navRect.bottom,
        height: navRect.height,
        paddingBottom: Number.parseFloat(navStyle.paddingBottom),
      },
      buttons: buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          label: button.textContent?.trim(),
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          width: rect.width,
          clientHeight: button.clientHeight,
          scrollHeight: button.scrollHeight,
          clientWidth: button.clientWidth,
          scrollWidth: button.scrollWidth,
        };
      }),
      footerBottom: footerRect.bottom,
    };
  });
}

test.before(async () => {
  if (!process.env.STAYBRIDGE_MOBILE_TEST_URL) {
    server = spawn(
      serverCommand,
      ["exec", "vinext", "start", "--hostname", "127.0.0.1", "--port", String(port)],
      {
        cwd: appRoot,
        env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/mobile-layout.log" },
        stdio: "ignore",
      },
    );
  }
  await waitForServer();
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  if (server) {
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
});

test("keeps the fixed navigation usable and the page content above it across safe areas", async () => {
  for (const safeAreaInsetBottom of [0, 20, 34]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await openRoute(context, "ja");
    const layout = await measureLayout(page, safeAreaInsetBottom);

    assert.equal(layout.viewport.width, 390);
    assert.equal(layout.nav.height, 62 + safeAreaInsetBottom);
    assert.ok(layout.nav.paddingBottom >= safeAreaInsetBottom);
    for (const button of layout.buttons) {
      assert.ok(button.height >= 44, `${button.label} hit area is ${button.height}px`);
      assert.ok(button.top >= layout.nav.top);
      assert.ok(button.bottom <= layout.nav.bottom - safeAreaInsetBottom);
    }
    assert.ok(
      layout.footerBottom <= layout.nav.top + 1,
      `footer bottom ${layout.footerBottom}px is covered by nav starting at ${layout.nav.top}px`,
    );
    await context.close();
  }
});

test("keeps all reviewed navigation labels visible at a 390px physical width with 200% zoom", async () => {
  // A 200% browser zoom makes a 390px physical viewport equivalent to 195 CSS px.
  for (const locale of ["ja", "en", "my"]) {
    const context = await browser.newContext({ viewport: { width: 195, height: 844 } });
    const page = await openRoute(context, locale);
    const layout = await measureLayout(page, 34);

    assert.equal(layout.viewport.width, 195, `${locale} effective CSS viewport`);
    for (const button of layout.buttons) {
      assert.ok(button.width >= 44, `${locale} ${button.label} width is ${button.width}px`);
      assert.ok(button.height >= 44, `${locale} ${button.label} height is ${button.height}px`);
      assert.ok(button.scrollWidth <= button.clientWidth + 1, `${locale} ${button.label} is horizontally clipped`);
      assert.ok(button.scrollHeight <= button.clientHeight + 1, `${locale} ${button.label} is vertically clipped`);
    }
    assert.ok(layout.footerBottom <= layout.nav.top + 1, `${locale} footer is covered by nav`);
    await context.close();
  }
});

test("connects reviewed conversation consent, recovery credentials, reload, and deletion in the real browser", async () => {
  const copy = {
    ja: { accept: "会話保存への同意を設定", decline: "保存しない", input: "相談したいこと", send: "送る", saved: "保存済み会話を削除", reply: "保存対象の回答です。", transient: "保存しない回答です。" },
    en: { accept: "Set storage consent", decline: "Do not save", input: "What do you want to ask?", send: "Send", saved: "Delete saved conversation", reply: "This response is saved.", transient: "This response is not saved." },
    my: { accept: "စကားပြောသိမ်းဆည်းမှု သဘောတူညီချက် ရွေးရန်", decline: "မသိမ်းရန်", input: "မေးလိုသောအချက်", send: "ပို့ရန်", saved: "သိမ်းထားသော စကားပြောကို ဖျက်ရန်", reply: "ဤအဖြေကို သိမ်းပါသည်။", transient: "ဤအဖြေကို မသိမ်းပါ။" },
  };
  const recordId = "con_44444444-4444-4444-8444-444444444444";

  for (const locale of ["ja", "en", "my"]) {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      const context = await browser.newContext({ viewport });
      const page = await openRoute(context, locale);
      await page.locator("nav[aria-label] button").first().click();
      await page.getByRole("heading", { name: locale === "ja" ? "AI相談アシスタント" : locale === "en" ? "AI consultation assistant" : "AI တိုင်ပင်ရေး အကူ" }).waitFor();

      let acceptedRequest;
      let declinedRequest;
      await page.route("**/api/conversations/**", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { deleted: true } }) });
      });
      await page.route("**/api/support-chat", async (route) => {
        const request = route.request();
        const payload = request.postDataJSON();
        if (payload.persistence) {
          acceptedRequest = payload;
          const pending = await page.evaluate(() => sessionStorage.getItem("staybridge.pending-conversation-request"));
          assert.match(pending ?? "", /"version":1/u);
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: copy[locale].reply, persistence: { status: "saved", id: recordId } }) });
        } else {
          declinedRequest = payload;
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: copy[locale].transient }) });
        }
      });

      await page.getByRole("button", { name: copy[locale].accept }).click();
      await page.getByRole("textbox", { name: copy[locale].input }).fill("support desk question");
      await page.getByRole("button", { name: copy[locale].send }).click();
      await page.getByText(copy[locale].reply).waitFor();
      assert.equal(acceptedRequest.persistence.consent.version, "conversation-2026-08-23");
      assert.equal(await page.evaluate(() => sessionStorage.getItem("staybridge.pending-conversation-request")), null);
      assert.match(await page.evaluate(() => sessionStorage.getItem("staybridge.saved-conversation-credentials")) ?? "", new RegExp(recordId, "u"));

      await page.reload({ waitUntil: "domcontentloaded" });
      assert.equal(await page.getByRole("button", { name: copy[locale].accept }).getAttribute("aria-pressed"), "true");
      await page.getByText(recordId).click();
      await page.getByRole("button", { name: copy[locale].saved }).click();
      await page.waitForFunction(() => sessionStorage.getItem("staybridge.saved-conversation-credentials") === null);

      await page.getByRole("button", { name: copy[locale].decline }).click();
      await page.getByRole("textbox", { name: copy[locale].input }).fill("do not save this turn");
      await page.getByRole("button", { name: copy[locale].send }).click();
      await page.getByText(copy[locale].transient).waitFor();
      assert.equal(declinedRequest.persistence, undefined);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
      await context.close();
    }
  }
});
