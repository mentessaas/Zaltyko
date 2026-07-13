import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const academyId = process.env.E2E_ACADEMY_ID;
const sessionId = process.env.E2E_COACH_SESSION_ID;
const coachStorageState = process.env.E2E_COACH_STORAGE_STATE ?? process.env.E2E_STORAGE_STATE;
const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function openWorkspace(page: Page) {
  await page.goto(`/app/${academyId}/coach/today/${sessionId}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
}

test.describe("coach session workspace", () => {
  test.skip(
    !academyId || !sessionId || !coachStorageState,
    "Set E2E_ACADEMY_ID, E2E_COACH_SESSION_ID and E2E_COACH_STORAGE_STATE to audit the coach workspace."
  );
  test.use(coachStorageState ? { storageState: coachStorageState } : {});
  test.describe.configure({ timeout: 120_000 });

  test("keeps the three class-of-today steps in one accessible flow", async ({ page }) => {
    await openWorkspace(page);

    await expect(page.getByRole("region", { name: "Estado del flujo" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pasar asistencia/ })).toBeVisible();
    await page.getByRole("button", { name: /Registrar progreso/ }).click();
    await expect(page.getByRole("heading", { name: "Progreso técnico rápido" })).toBeVisible();
    await page.getByRole("button", { name: /Avisar a familias/ }).click();
    await expect(page.getByRole("heading", { name: "Aviso interno a las familias" })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
    expect(results.violations).toEqual([]);
  });

  test("does not overflow a compact mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openWorkspace(page);

    const dimensions = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
    }));

    expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    await expect(page.getByRole("tab", { name: "Asistencia" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Progreso" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Aviso" })).toBeVisible();
  });
});
