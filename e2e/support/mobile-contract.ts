import { expect, type Locator, type Page } from "@playwright/test";

export const mobileViewportWidths = [375, 390, 430] as const;

export async function expectPageContract(page: Page) {
  await expect(page.getByRole("main")).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectNamedInteractiveControls(page);
}

export async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    overflow.scrollWidth,
    `document overflows horizontally: ${overflow.scrollWidth}px > ${overflow.clientWidth}px`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

export async function expectNamedInteractiveControls(page: Page) {
  for (const role of ["button", "link", "combobox", "textbox", "radio", "checkbox"] as const) {
    const controls = page.getByRole(role);
    for (let index = 0; index < await controls.count(); index += 1) {
      const control = controls.nth(index);
      if (await control.isVisible()) {
        await expect(control, `visible ${role} #${index + 1} must have an accessible name`).toHaveAccessibleName(/\S/);
      }
    }
  }
}

export async function tabTo(page: Page, target: Locator, maxTabs = 24) {
  for (let attempt = 0; attempt < maxTabs; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }
  throw new Error(`keyboard focus did not reach target after ${maxTabs} Tab presses`);
}

export async function expectKeyboardFocusVisible(page: Page, target: Locator) {
  await tabTo(page, target);
  await expect(target).toBeFocused();
  expect(await target.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
}
