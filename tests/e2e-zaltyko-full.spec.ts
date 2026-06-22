import { expect, test, type Page } from "@playwright/test";

const academyId = process.env.E2E_ACADEMY_ID;
const storageState = process.env.E2E_STORAGE_STATE;
const academyPath = (path: string) => `/app/${academyId}/${path.replace(/^\//, "")}`;

test.skip(!academyId, "Set E2E_ACADEMY_ID to run Zaltyko full academy E2E tests.");

async function expectNoRouteError(page: Page) {
  await expect(page.getByText(/Failed query|This page could not be found|Application error/i)).toHaveCount(0);
}

async function gotoAcademy(page: Page, path: string) {
  const targetPath = academyPath(path);
  try {
    await page.goto(targetPath, { waitUntil: "domcontentloaded", timeout: 120_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ERR_EMPTY_RESPONSE|ERR_ABORTED|Timeout/.test(message)) {
      throw error;
    }

    await page.waitForTimeout(1_000);
    await page.goto(targetPath, { waitUntil: "domcontentloaded", timeout: 120_000 });
  }
  await expectNoRouteError(page);
}

test.describe("Zaltyko full academy flows", () => {
  test.use(storageState ? { storageState } : {});
  test.describe.configure({ timeout: 90_000 });

  test("desktop navigation exposes core academy modules", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoAcademy(page, "dashboard");

    const academyNavigation = page.getByRole("navigation").filter({ hasText: "Academia" }).first();
    for (const label of [
      "Dashboard",
      "Entrenadores",
      "Grupos",
      "Entrenamientos",
      "Eventos",
      "Facturación",
      "Evaluaciones",
      "Mensajes",
      "Ajustes",
    ]) {
      await expect(academyNavigation).toContainText(label);
    }
    await expect(academyNavigation).toContainText(/Atletas|Gimnastas/);
  });

  test("critical academy pages render without route-level errors", async ({ page }) => {
    test.setTimeout(180_000);

    for (const path of [
      "dashboard",
      "athletes",
      "athletes/new",
      "groups",
      "classes",
      "billing",
      "settings",
      "assessments",
      "evaluations",
      "messages",
      "events",
    ]) {
      await gotoAcademy(page, path);
    }
  });

  test("responsive shell works at Sprint 3 audit breakpoints", async ({ page }) => {
    test.setTimeout(180_000);

    for (const viewport of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoAcademy(page, "dashboard");
      await expect(page.locator("#main-content")).toBeVisible();
      await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
      await page.screenshot({
        path: `test-results/sprint-3/dashboard-${viewport.width}x${viewport.height}.png`,
        fullPage: true,
      });
    }
  });

  test("mobile navigation exposes primary actions without desktop sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoAcademy(page, "dashboard");

    await expect(page.getByRole("navigation").last()).toBeVisible();
    await expect(page.getByRole("button", { name: /dashboard/i }).first()).toBeVisible();
  });

  test("command palette opens and exposes search/navigation sections", async ({ page }) => {
    await gotoAcademy(page, "dashboard");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");

    await expect(page.getByPlaceholder(/Buscar en la academia/i)).toBeVisible();
    await expect(page.getByText("Acciones rápidas")).toBeVisible();
  });

  test("athletes list and first detail page are stable when data exists", async ({ page }) => {
    await gotoAcademy(page, "athletes");

    const firstAthleteLink = page.locator(`a[href^="/app/${academyId}/athletes/"]:not([href$="/new"])`).first();
    const athleteCount = await firstAthleteLink.count();
    test.skip(athleteCount === 0, "No athletes found in the configured academy.");

    await firstAthleteLink.click();
    await expect(page).toHaveURL(new RegExp(`/app/${academyId}/athletes/[^/]+$`));
    await expectNoRouteError(page);
  });

  test("groups and classes pages keep their primary list surfaces visible", async ({ page }) => {
    await gotoAcademy(page, "groups");
    await expect(page.locator("#main-content")).toBeVisible();

    await gotoAcademy(page, "classes");
    await expect(page.locator("#main-content")).toBeVisible();
  });

  test("billing and settings pages render admin surfaces", async ({ page }) => {
    await gotoAcademy(page, "billing");
    await expect(page.locator("#main-content")).toBeVisible();

    await gotoAcademy(page, "settings");
    await expect(page.locator("#main-content")).toBeVisible();
  });

  test("keyboard users can skip to main content", async ({ page }) => {
    await gotoAcademy(page, "dashboard");
    await page.waitForSelector('a[href="#main-content"]', { state: "attached", timeout: 10_000 });
    // Reset focus to body before pressing Tab
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      document.body.focus();
    });
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: /saltar al contenido/i }).first();
    await expect(skipLink).toBeFocused();
  });

  test("authenticated academy routes do not show the PWA install banner", async ({ page }) => {
    for (const path of ["dashboard", "athletes", "classes", "settings"]) {
      await gotoAcademy(page, path);
      await page.waitForTimeout(1000);
      await expect(page.getByText("Instalar Zaltyko")).toHaveCount(0);
    }
  });
});
