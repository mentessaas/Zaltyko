import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

/**
 * ZAL-621 — Recorridos P0 del dueño, coach y familia (Web)
 *
 * Extiende la cobertura a11y de `tests/a11y-zaltyko.spec.ts` (que solo cubre
 * `/app/{academyId}/dashboard` y `/app/{academyId}/athletes`) y la matriz
 * focal de ZAL-604 (`tests/e2e-zal-604-a11y-focal.spec.ts`) a las rutas
 * restantes del contrato P0 publicado en
 * `vault/06-Roadmap-y-Tareas/ZAL-619 contrato P0 ICP gimnasia Web Mobile v1.0 2026-08-12.md`:
 *
 *   - Dueño: buscar → dashboard → agenda/asistencia → comunicación →
 *     progreso → cobros → importación asistida.
 *   - Coach: agenda → sesión → asistencia → progreso → mensaje autorizado.
 *   - Familia: my-dashboard → agenda/avisos → mensajes → progreso
 *     publicado → cargos propios.
 *
 * Tres bloques:
 *   1. axe WCAG 2.2 AA en las 8 rutas P0 que NO están en a11y-zaltyko.spec.ts.
 *   2. Matriz responsive (3 viewports × 10 rutas): sin error de ruta,
 *      sin overflow horizontal.
 *   3. Matriz teclado/foco (3 viewports × 10 rutas): tras pulsar Tab cinco
 *      veces, cada `document.activeElement` es visible y no está oculto
 *      vía CSS.
 *
 * Skip limpio si no hay `E2E_ACADEMY_ID` + `E2E_STORAGE_STATE` para no
 * romper `pnpm test:a11y` en sandboxes sin academia aislada.
 *
 * Ejecución local (mismo patrón que ZAL-604):
 *
 *   pnpm dev  # falla con errno -11 mientras el repo siga en iCloud dataless
 *   E2E_ACADEMY_ID=… E2E_STORAGE_STATE=… BASE_URL=http://127.0.0.1:3000 \
 *     pnpm exec playwright test tests/e2e-zal-621-a11y-journeys.spec.ts \
 *     --project=chromium
 */

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const academyId = process.env.E2E_ACADEMY_ID;
const storageState = process.env.E2E_STORAGE_STATE;
const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Recorridos P0 (dueño, coach, familia) cuya URL existe en el árbol actual.
const p0Paths = [
  "dashboard",
  "classes",
  "attendance",
  "comms",
  "announcements",
  "messages",
  "evaluations",
  "billing",
  "my-dashboard",
  "athletes",
] as const;

// Rutas P0 que ya tienen cobertura axe en `a11y-zaltyko.spec.ts`.
const axeAlreadyCovered = new Set(["dashboard", "athletes"]);

const viewports = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "390px", width: 390, height: 844 },
  { name: "320px", width: 320, height: 568 },
] as const;

async function gotoAcademy(page: Page, path: string) {
  await page.goto(`${baseURL}/app/${academyId}/${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page
    .waitForLoadState("networkidle", { timeout: 30_000 })
    .catch(() => undefined);
  await expect(page.locator("body")).toBeVisible({ timeout: 30_000 });
}

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

async function expectNoRouteError(page: Page) {
  await expect(
    page.getByText(/Failed query|This page could not be found|Application error/i),
  ).toHaveCount(0);
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      clientWidth: doc.clientWidth,
    };
  });
  expect(
    overflow.scrollWidth,
    `Horizontal overflow: scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function expectKeyboardNavigation(page: Page, path: string) {
  await page.keyboard.press("Tab");
  for (let i = 0; i < 5; i += 1) {
    const active = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? "").trim().slice(0, 80),
        visible:
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0,
      };
    });
    expect(active, `path=${path} step=${i} activeElement is body`).not.toBeNull();
    expect(
      active?.visible,
      `path=${path} step=${i} ${active?.tag} "${active?.text}" not visible`,
    ).toBe(true);
    await page.keyboard.press("Tab");
  }
}

const authSkipMessage =
  "Set E2E_ACADEMY_ID and E2E_STORAGE_STATE to run ZAL-621 P0 journeys checks.";

test.describe("ZAL-621: P0 journeys — axe WCAG 2.2 AA (rutas no cubiertas)", () => {
  test.skip(!academyId || !storageState, authSkipMessage);
  test.use({ storageState });
  test.describe.configure({ mode: "serial" });
  test.describe.configure({ timeout: 120_000 });

  for (const path of p0Paths) {
    if (axeAlreadyCovered.has(path)) continue;
    test(`/app/${path} has no WCAG A/AA violations`, async ({ page }) => {
      await gotoAcademy(page, path);
      await expectNoRouteError(page);
      const results = await analyzeStablePage(page);
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }
});

test.describe("ZAL-621: P0 journeys — responsive matrix (no overflow, no route error)", () => {
  test.skip(!academyId || !storageState, authSkipMessage);
  test.describe.configure({ mode: "serial" });
  test.describe.configure({ timeout: 180_000 });

  for (const viewport of viewports) {
    for (const path of p0Paths) {
      test(`@${viewport.name} /app/${path} renders without route error`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          storageState,
        });
        const page = await context.newPage();
        try {
          await gotoAcademy(page, path);
          await expectNoRouteError(page);
        } finally {
          await context.close();
        }
      });

      test(`@${viewport.name} /app/${path} no horizontal overflow`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          storageState,
        });
        const page = await context.newPage();
        try {
          await gotoAcademy(page, path);
          await expectNoRouteError(page);
          await expectNoHorizontalOverflow(page);
        } finally {
          await context.close();
        }
      });
    }
  }
});

test.describe("ZAL-621: P0 journeys — keyboard/focus matrix", () => {
  test.skip(!academyId || !storageState, authSkipMessage);
  test.describe.configure({ mode: "serial" });
  test.describe.configure({ timeout: 180_000 });

  for (const viewport of viewports) {
    for (const path of p0Paths) {
      test(`@${viewport.name} /app/${path} keyboard tab order reaches visible focusable elements`, async ({
        browser,
      }) => {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          storageState,
        });
        const page = await context.newPage();
        try {
          await gotoAcademy(page, path);
          await expectNoRouteError(page);
          await expectKeyboardNavigation(page, path);
        } finally {
          await context.close();
        }
      });
    }
  }
});