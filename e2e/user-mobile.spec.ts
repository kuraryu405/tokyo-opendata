import { expect, test } from "@playwright/test";
import {
  expectKeyboardFocusVisible,
  expectPageContract,
  mobileViewportWidths,
} from "./support/mobile-contract";

const locales = ["ja", "en", "my"] as const;
const mobileHeight = 844;

async function expectRoute(page: Parameters<typeof expectPageContract>[0], locale: string, route: string) {
  await expect(page).toHaveURL(new RegExp(`/${locale}/${route}(?:\\?|$)`));
  await expectPageContract(page);
}

for (const width of mobileViewportWidths) {
  for (const locale of locales) {
    test(`${locale} major routes stay operable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: mobileHeight });
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expectPageContract(page);

      const start = page.locator(".hero-actions .primary-button");
      await expect(start).toBeEnabled();
      await start.click();
      await expectRoute(page, locale, "check");
      await expect(page.locator(".searchable-answer input[type=search]")).toBeVisible();
      await expect(page.locator(".searchable-answer datalist option")).toHaveCount(23);

      await page.goto(`/${locale}`);
      const demo = page.locator(".hero-actions .secondary-button");
      await expect(demo).toBeEnabled();
      await demo.click();
      await expectRoute(page, locale, "status");

      await page.locator(".stack-actions .primary-button").click();
      await expectRoute(page, locale, "roadmap");

      await page.locator(".roadmap-aside .aside-card").first().getByRole("button").click();
      await expectRoute(page, locale, "local");

      await page.locator(".page-actions .primary-button").click();
      await expectRoute(page, locale, "help");

      await page.locator(".prepare-card .primary-button").click();
      await expectRoute(page, locale, "summary");
    });
  }
}

test("keyboard-only persona flow reaches summary without losing focus visibility", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: mobileHeight });
  await page.goto("/ja");

  const skipLink = page.locator(".skip-link");
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  expect(await skipLink.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  expect(await skipLink.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);

  const start = page.locator(".hero-actions .primary-button");
  await expectKeyboardFocusVisible(page, start);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ja\/check(?:\?step=0)?$/);

  for (let step = 0; step < 10; step += 1) {
    await expect(page.locator(".question-card h1")).toBeVisible();
    if (step < 2) {
      const search = page.locator(".searchable-answer input[type=search]");
      const firstOption = page.locator(".searchable-answer datalist option").first();
      await search.fill(await firstOption.getAttribute("value") ?? "");
    } else {
      await page.locator(".option-grid .option-button").first().click();
    }
    const next = page.locator(".question-actions .primary-button");
    await expect(next).toBeEnabled();
    await next.click();
    if (step < 9) {
      await expect(page).toHaveURL(new RegExp(`/ja/check\\?step=${step + 1}$`));
    }
  }

  await expectRoute(page, "ja", "status");
  await page.locator(".stack-actions .primary-button").click();
  await expectRoute(page, "ja", "roadmap");
  await page.locator(".roadmap-aside .aside-card").first().getByRole("button").click();
  await expectRoute(page, "ja", "local");
  await page.locator(".page-actions .primary-button").click();
  await expectRoute(page, "ja", "help");
  await page.locator(".prepare-card .primary-button").click();
  await expectRoute(page, "ja", "summary");
});
