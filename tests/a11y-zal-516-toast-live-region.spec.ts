import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

// Next.js ships a hidden `__next-route-announcer__` with role="alert" for
// client-side route changes. We scope our toast-region queries to nodes that
// live inside the toast container so we don't false-positive on it.
const TOAST_CONTAINER = '[aria-live]';

async function waitForToast(page: Page) {
  await page
    .locator(`${TOAST_CONTAINER}[role="status"], ${TOAST_CONTAINER}[role="alert"]`)
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

async function analyze(page: Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .include(TOAST_CONTAINER)
    .analyze();
}

test.describe("ZAL-516 toast container is a live region", () => {
  test.describe.configure({ timeout: 90_000 });

  test("success/info toast renders in a polite live region", async ({ page }) => {
    await page.goto(`${baseURL}/auth/login?registered=1`, {
      waitUntil: "domcontentloaded",
    });
    await waitForToast(page);

    const politeRegion = page
      .locator(`${TOAST_CONTAINER}[role="status"][aria-live="polite"]`)
      .first();
    await expect(politeRegion).toBeVisible();
    await expect(politeRegion).toHaveAttribute("aria-atomic", "true");
    await expect(politeRegion).toContainText(/Revisa tu correo/i);

    // No error/warning toast active, so no assertive region from the provider.
    const assertiveFromProvider = page.locator(
      `${TOAST_CONTAINER}[role="alert"][aria-live="assertive"]:not(#__next-route-announcer__)`
    );
    await expect(assertiveFromProvider).toHaveCount(0);

    const results = await analyze(page);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("error/warning toast renders in an assertive live region", async ({ page }) => {
    await page.goto(`${baseURL}/auth/login?error=callback_failed`, {
      waitUntil: "domcontentloaded",
    });
    await waitForToast(page);

    const assertiveRegion = page
      .locator(`${TOAST_CONTAINER}[role="alert"][aria-live="assertive"]:not(#__next-route-announcer__)`)
      .first();
    await expect(assertiveRegion).toBeVisible();
    await expect(assertiveRegion).toHaveAttribute("aria-atomic", "true");
    await expect(assertiveRegion).toContainText(/No pudimos completar el acceso/i);

    const closeButton = assertiveRegion.locator('button[aria-label]').first();
    await expect(closeButton).toHaveAttribute("aria-label", "Cerrar aviso");

    const results = await analyze(page);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("empty state renders no toast live region nodes (no DOM noise)", async ({ page }) => {
    await page.goto(`${baseURL}/auth/login`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const statuses = page.locator('[role="status"]');
    const toastAlerts = page.locator(
      `${TOAST_CONTAINER}[role="alert"]:not(#__next-route-announcer__)`
    );
    await expect(statuses).toHaveCount(0);
    await expect(toastAlerts).toHaveCount(0);
  });
});

