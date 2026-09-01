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
    const header = document.querySelector(".velorah-nav");
    const nav = document.querySelector("nav[aria-label]");
    const buttons = [...document.querySelectorAll("nav[aria-label] button")];
    const footer = document.querySelector(".site-footer");
    if (!header || !nav || footer || buttons.length !== 3) throw new Error("Expected cinematic mobile navigation landmarks are missing");

    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    const headerRect = header.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    const navStyle = getComputedStyle(nav);

    return {
      viewport: { width: innerWidth, height: innerHeight },
      header: { top: headerRect.top, bottom: headerRect.bottom },
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
      footerAbsent: footer === null,
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

test("keeps the cinematic header navigation usable and removes the footer across safe areas", async () => {
  for (const safeAreaInsetBottom of [0, 20, 34]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await openRoute(context, "ja");
    const layout = await measureLayout(page, safeAreaInsetBottom);

    assert.equal(layout.viewport.width, 390);
    assert.ok(layout.header.top >= 0);
    assert.ok(layout.nav.top >= layout.header.top);
    assert.ok(layout.nav.bottom <= layout.header.bottom + 1);
    for (const button of layout.buttons) {
      assert.ok(button.height >= 44, `${button.label} hit area is ${button.height}px`);
      assert.ok(button.top >= layout.nav.top);
      assert.ok(button.bottom <= layout.nav.bottom + 1);
    }
    assert.equal(layout.footerAbsent, true);
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
    assert.equal(layout.footerAbsent, true, `${locale} footer should be removed`);
    await context.close();
  }
});

test("shows the verified Open Data update date through the real Local Action journey", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await openRoute(context, "ja");

  await page.getByRole("button", { name: "近くの支援", exact: true }).click();
  const resourceCard = page.locator("article.resource-card").filter({ hasText: "おうじキッズクリニック" });
  await resourceCard.getByText("出典を見る", { exact: true }).click();

  await assert.doesNotReject(resourceCard.getByText("データ更新: 2024-10-31", { exact: true }).waitFor());
  await context.close();
});
