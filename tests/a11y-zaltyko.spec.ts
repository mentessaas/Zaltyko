import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const academyId = process.env.E2E_ACADEMY_ID;
const storageState = process.env.E2E_STORAGE_STATE;

async function scanPage(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
}

test.describe("Zaltyko public accessibility audit", () => {
  test("public landing page has no WCAG A/AA violations", async ({ page }) => {
    await scanPage(page, "/");
  });

  test("public login page has no WCAG A/AA violations", async ({ page }) => {
    await scanPage(page, "/auth/login");
  });
});

test.describe("Zaltyko authenticated accessibility audit", () => {
  test.use(storageState ? { storageState } : {});

  test("academy dashboard has no WCAG A/AA violations", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!academyId, "Set E2E_ACADEMY_ID to run authenticated academy a11y checks.");
    await scanPage(page, `/app/${academyId}/dashboard`);
  });

  test("academy athletes page has no WCAG A/AA violations", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!academyId, "Set E2E_ACADEMY_ID to run authenticated academy a11y checks.");
    await scanPage(page, `/app/${academyId}/athletes`);
  });
});
