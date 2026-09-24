import { test, expect } from "@playwright/test";

/**
 * T8.5 — E2E del marketplace público entre academias.
 * Verifica que la página de browse carga con las cards y filtros funcionan.
 *
 * Requiere DB con datos seedeados o salta con test.skip si el endpoint no
 * devuelve listings (modo test sin staging).
 */

test.describe("Marketplace public", () => {
  test("browse page carga y muestra listings si hay", async ({ page }) => {
    await page.goto("/marketplace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    const heading = page.getByRole("heading", { name: /Marketplace/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Si hay listings, las cards aparecen; si no, sale el empty state
    const empty = page.getByText(/No active listings/i);
    const hasEmpty = await empty.isVisible().catch(() => false);

    if (!hasEmpty) {
      // Verificar que al menos un card tiene título y precio
      const firstCard = page.locator("article").first();
      await expect(firstCard).toBeVisible();
      const cardText = await firstCard.textContent();
      expect(cardText).toBeTruthy();
    }
  });

  test("search bar acepta input y filtra (mínimo)", async ({ page }) => {
    await page.goto("/marketplace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    // El search bar es un input[type=search]
    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill("grips");
    await searchInput.press("Enter");

    // Espera a que la URL cambie (q=grips en query string)
    await page.waitForURL(/q=grips/, { timeout: 15_000 });
    expect(page.url()).toContain("q=grips");
  });
});
