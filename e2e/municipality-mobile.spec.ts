import { expect, test, type Route } from "@playwright/test";
import { expectKeyboardFocusVisible, expectPageContract, mobileViewportWidths } from "./support/mobile-contract";

const mobileHeight = 844;

async function fulfillNeeds(route: Route) {
  const url = new URL(route.request().url());
  const period = url.searchParams.get("period") ?? "30d";
  const view = url.searchParams.get("view") ?? "needs";
  const category = view === "return_status"
    ? "difficult"
    : view === "departure_window"
      ? "within_30_days"
      : view === "accommodation"
        ? "unstable"
        : "stay";
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      data: {
        municipality: "13117",
        period,
        view,
        availability: "available",
        freshness: "fresh",
        threshold: 5,
        countBucketSize: 5,
        coverageNote: "Browser regression fixture.",
        limitations: ["Browser regression fixture."],
        categories: [{ key: category, submissionCount: 10 }],
        hasSuppressedCategories: false,
        submissionCount: 10,
        lastUpdatedAt: "2026-08-24"
      }
    })
  });
}

for (const width of mobileViewportWidths) {
  test(`Preparedness View remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: mobileHeight });
    await page.route("**/api/crisis/needs?**", fulfillNeeds);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("crisis-needs-available")).toBeVisible();
    await expectPageContract(page);
  });
}

test("Preparedness controls are keyboard reachable and refresh the selected view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: mobileHeight });
  await page.route("**/api/crisis/needs?**", fulfillNeeds);
  await page.goto("/");

  const period = page.getByRole("combobox", { name: "対象期間" });
  const view = page.getByRole("combobox", { name: "表示軸" });
  await expectKeyboardFocusVisible(page, period);

  await Promise.all([
    page.waitForResponse((response) => response.url().includes("period=7d") && response.ok()),
    period.selectOption("7d")
  ]);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("view=return_status") && response.ok()),
    view.selectOption("return_status")
  ]);

  await expect(page.getByTestId("crisis-needs-available")).toBeVisible();
  await expectPageContract(page);
});

test("Preparedness loading and error states keep the controls usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: mobileHeight });
  await page.route("**/api/crisis/needs?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await fulfillNeeds(route);
  });
  await page.goto("/");

  await expect(page.locator(".crisis-needs-loading")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "対象期間" })).toBeEnabled();
  await expect(page.getByTestId("crisis-needs-available")).toBeVisible();

  await page.unroute("**/api/crisis/needs?**");
  await page.route("**/api/crisis/needs?**", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ ok: false })
  }));
  await page.reload();

  await expect(page.getByTestId("crisis-needs-error")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "対象期間" })).toBeEnabled();
  await expect(page.getByRole("combobox", { name: "表示軸" })).toBeEnabled();
  await expectPageContract(page);
});
