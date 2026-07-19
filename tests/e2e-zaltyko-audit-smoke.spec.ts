import { expect, test } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const academyId = process.env.E2E_ACADEMY_ID;
const storageState = process.env.E2E_STORAGE_STATE;

test.skip(!academyId, "Set E2E_ACADEMY_ID to run Zaltyko academy smoke tests.");

test.describe("Zaltyko audit smoke flows", () => {
  test.use(storageState ? { storageState } : {});

  test("academy navigation exposes core modules", async ({ page }) => {
    await page.goto(`${baseURL}/app/${academyId}/dashboard`);

    const academyNavigation = page.getByRole("navigation").filter({ hasText: "Academia" });
    for (const label of [
      "Dashboard",
      "Entrenadores",
      "Grupos",
      "Clases",
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
    const paths = [
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
    ];

    for (const path of paths) {
      await page.goto(`${baseURL}/app/${academyId}/${path}`);
      await expect(page.getByText(/Failed query|404|This page could not be found/i)).toHaveCount(0);
    }
  });

  test("athlete detail renders when an athlete exists", async ({ page }) => {
    await page.goto(`${baseURL}/app/${academyId}/athletes`);

    const firstAthleteLink = page.locator(`a[href^="/app/${academyId}/athletes/"]:not([href$="/new"])`).first();
    const athleteCount = await firstAthleteLink.count();
    test.skip(athleteCount === 0, "No athletes found in the configured academy.");

    await firstAthleteLink.click();
    await expect(page.getByText(/Failed query|404|This page could not be found/i)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/app/${academyId}/athletes/[^/]+$`));
  });

  test("command palette opens with search input and navigation actions", async ({ page }) => {
    await page.goto(`${baseURL}/app/${academyId}/dashboard`);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");

    await expect(page.getByPlaceholder(/Buscar (atletas|gimnastas)/i)).toBeVisible();
    await expect(page.getByText("Acciones rápidas")).toBeVisible();
    await expect(page.getByText("Navegación")).toBeVisible();
  });

  test("authenticated academy routes do not show the PWA install banner", async ({ page }) => {
    for (const path of ["dashboard", "athletes", "classes", "settings"]) {
      await page.goto(`${baseURL}/app/${academyId}/${path}`);
      await page.waitForTimeout(3500);
      await expect(page.getByText("Instalar Zaltyko")).toHaveCount(0);
    }
  });
});
