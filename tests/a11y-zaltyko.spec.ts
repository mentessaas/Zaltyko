import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const academyId = process.env.E2E_ACADEMY_ID;
const storageState = process.env.E2E_STORAGE_STATE;
const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function analyzeStablePage(page: Page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await new AxeBuilder({ page }).withTags(axeTags).analyze();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 1 || !/Execution context was destroyed|frame was detached|navigation/i.test(message)) {
        throw error;
      }

      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(1_000);
    }
  }

  throw new Error("Axe analysis failed after retry.");
}

async function scanPage(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await expect(page.locator("body")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(750);

  const results = await analyzeStablePage(page);

  expect(results.violations).toEqual([]);
}

test.describe("Zaltyko public accessibility audit", () => {
  test.describe.configure({ timeout: 120_000 });

  test("public landing page has no WCAG A/AA violations", async ({ page }) => {
    await scanPage(page, "/");
  });

  test("public login page has no WCAG A/AA violations", async ({ page }) => {
    await scanPage(page, "/auth/login");
  });
});

test.describe("Zaltyko authenticated accessibility audit", () => {
  test.use(storageState ? { storageState } : {});
  test.describe.configure({ timeout: 120_000 });

  test("academy dashboard has no WCAG A/AA violations", async ({ page }) => {
    test.skip(!academyId, "Set E2E_ACADEMY_ID to run authenticated academy a11y checks.");
    await scanPage(page, `/app/${academyId}/dashboard`);
  });

  test("academy athletes page has no WCAG A/AA violations", async ({ page }) => {
    test.skip(!academyId, "Set E2E_ACADEMY_ID to run authenticated academy a11y checks.");
    await scanPage(page, `/app/${academyId}/athletes`);
  });
});
