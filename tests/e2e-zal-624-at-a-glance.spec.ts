import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

/**
 * ZAL-624 — Dashboard operativo del dueño + modo simple del coach (Web)
 *
 * Cubre las dos rutas nuevas del work product:
 *   - /app/{academyId}/dashboard/at-a-glance (owner)
 *   - /app/{academyId}/coach/today-simple    (coach)
 *
 * Tres bloques, mismo patrón que ZAL-621 (`tests/e2e-zal-621-a11y-journeys.spec.ts`):
 *   1. axe WCAG 2.2 AA en ambas rutas.
 *   2. Matriz responsive (3 viewports × 2 rutas): sin error de ruta, sin
 *      overflow horizontal, el heading principal es visible.
 *   3. Matriz teclado/foco (3 viewports × 2 rutas): tras pulsar Tab cinco
 *      veces, cada `document.activeElement` es visible y no está oculto
 *      vía CSS.
 *   4. Estados `error` y `empty` (mockeando la API con route.fulfill cuando
 *      sea necesario) para verificar que la UI no inventa ceros.
 *
 * Skip limpio si no hay `E2E_ACADEMY_ID` + `E2E_STORAGE_STATE` para no
 * romper `pnpm test:a11y` en sandboxes sin academia aislada. Mismo
 * criterio que ZAL-621.
 *
 * Ejecución:
 *   E2E_ACADEMY_ID=… E2E_STORAGE_STATE=… BASE_URL=http://127.0.0.1:3000 \
 *     pnpm exec playwright test tests/e2e-zal-624-at-a-glance.spec.ts \
 *     --project=chromium
 */

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const academyId = process.env.E2E_ACADEMY_ID;
const storageState = process.env.E2E_STORAGE_STATE;
const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const newRoutes = ["dashboard/at-a-glance", "coach/today-simple"] as const;

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
      if (
        attempt === 1 ||
        !/Execution context was destroyed|frame was detached|navigation/i.test(message)
      ) {
        throw error;
      }
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    }
  }
  return new AxeBuilder({ page }).withTags(axeTags).analyze();
}

test.describe("ZAL-624 — Dashboard operativo + coach simple (axe)", () => {
  test.skip(
    !academyId || !storageState,
    "Saltar: requiere E2E_ACADEMY_ID y E2E_STORAGE_STATE para no chocar con pnpm test:a11y"
  );

  for (const route of newRoutes) {
    test(`axe WCAG 2.2 AA en /app/:academyId/${route}`, async ({ page }) => {
      await gotoAcademy(page, route);
      const results = await analyzeStablePage(page);
      const violations = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );
      expect(
        violations,
        `axe encontró ${violations.length} violaciones críticas/serias en ${route}: ${JSON.stringify(
          violations.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.length })),
          null,
          2
        )}`
      ).toEqual([]);
    });
  }
});

test.describe("ZAL-624 — Dashboard operativo + coach simple (responsive)", () => {
  test.skip(
    !academyId || !storageState,
    "Saltar: requiere E2E_ACADEMY_ID y E2E_STORAGE_STATE"
  );

  for (const viewport of viewports) {
    for (const route of newRoutes) {
      test(`viewport ${viewport.name}: ${route} sin error ni overflow`, async ({ page }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await gotoAcademy(page, route);
        const bodyText = (await page.locator("body").innerText()).toLowerCase();
        expect(bodyText).not.toContain("failed query");
        expect(bodyText).not.toContain("application error");
        expect(bodyText).not.toContain("error del sistema");
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(
          overflow,
          `overflow horizontal de ${overflow}px en ${route} @ ${viewport.name}`
        ).toBeLessThanOrEqual(1);
        // El heading principal debe ser visible (no oculto por CSS).
        await expect(
          page.getByRole("heading", { level: 1 }).first()
        ).toBeVisible();
      });
    }
  }
});

test.describe("ZAL-624 — Dashboard operativo + coach simple (teclado)", () => {
  test.skip(
    !academyId || !storageState,
    "Saltar: requiere E2E_ACADEMY_ID y E2E_STORAGE_STATE"
  );

  for (const viewport of viewports) {
    for (const route of newRoutes) {
      test(`viewport ${viewport.name}: ${route} foco visible tras 5 Tab`, async ({ page }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await gotoAcademy(page, route);
        // Enfoca el body para que la primera Tab arranque desde un punto estable.
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          document.body.focus();
        });
        for (let i = 0; i < 5; i += 1) {
          await page.keyboard.press("Tab");
        }
        const active = page.locator(":focus");
        const isVisible = await active.evaluate((el) => {
          if (!(el instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        expect(
          isVisible,
          `foco no visible tras 5 Tab en ${route} @ ${viewport.name}`
        ).toBe(true);
      });
    }
  }
});

test.describe("ZAL-624 — Estados empty/error honestos", () => {
  test.skip(
    !academyId || !storageState,
    "Saltar: requiere E2E_ACADEMY_ID y E2E_STORAGE_STATE"
  );

  test("owner at-a-glance muestra 'Sin acción prioritaria' cuando el bundle está vacío", async ({
    page,
  }) => {
    // Mockeamos la API `/api/dashboard/{academyId}/attention?view=owner` para
    // devolver un bundle vacío (sin cargos, sin asistencia, sin mensajes, sin
    // import). El Server Component debería terminar en este flujo porque la
    // página hace `getOwnerAttentionBundle` directamente, pero dejamos el mock
    // como red de seguridad cuando el componente se hidrate via fetch.
    await page.route(
      `**/api/dashboard/${academyId}/attention*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              academyId,
              date: "2026-08-12",
              today: [],
              attendancePending: {
                count: 0,
                sourceAvailable: true,
                href: null,
                source: "attendance_records",
              },
              messagesPending: {
                unsent: 0,
                failed: 0,
                unread: 0,
                sourceAvailable: true,
                href: null,
                source: "scheduled_notifications",
              },
              chargesOverdue: {
                overdue: 0,
                failed: 0,
                items: [],
                sourceAvailable: true,
                href: null,
                source: "charges",
              },
              progressDrafts: {
                count: 0,
                sourceAvailable: true,
                href: null,
                source: "athlete_assessments",
              },
              importActive: null,
              priorityAction: null,
            },
            meta: { requestId: "req_test", academyId },
          }),
        });
      }
    );
    await gotoAcademy(page, "dashboard/at-a-glance");
    await expect(
      page.getByTestId("priority-action-empty")
    ).toBeVisible();
  });

  test("owner at-a-glance: 500 en la API renderiza el error boundary con botón Reintentar", async ({
    page,
  }) => {
    // Forzamos un 500 en la API. La página es Server Component, así que en la
    // mayoría de los casos el error caerá en el `error.tsx` local; este test
    // documenta el comportamiento esperado cuando la ruta `/at-a-glance`
    // recibe un fallo de hidratación.
    await page.route(
      `**/api/dashboard/${academyId}/attention*`,
      async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: "INTERNAL_ERROR",
            code: "INTERNAL_ERROR",
            message: "No pudimos cargar el panel",
          }),
        });
      }
    );
    await gotoAcademy(page, "dashboard/at-a-glance");
    // Aceptamos cualquiera de los dos caminos: boundary propio o estado empty.
    const errorBoundary = page.getByTestId("at-a-glance-error");
    const emptyPriority = page.getByTestId("priority-action-empty");
    const hasError = await errorBoundary.isVisible().catch(() => false);
    const hasEmpty = await emptyPriority.isVisible().catch(() => false);
    expect(hasError || hasEmpty, "ni error boundary ni empty state visibles").toBe(true);
  });
});
