import { expect, test, type Locator } from "@playwright/test";

async function gotoPublic(page: import("@playwright/test").Page, path: string) {
  // Next dev puede abortar la primera navegación cuando compila una ruta
  // dinámica fría. Reintentamos solo ese error concreto; cualquier otro
  // fallo sigue siendo una regresión real del flujo público.
  try {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED")) throw error;
    await page.waitForTimeout(750);
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
  }
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function expectReactHydrated(locator: Locator) {
  await expect
    .poll(
      () =>
        locator.evaluate((element) =>
          Object.keys(element).some((key) => key.startsWith("__reactProps$")),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
}

test.describe("Zaltyko public site smoke", () => {
  test.describe.configure({ mode: "serial" });
  test.describe.configure({ timeout: 120_000 });

  test("dynamic sitemap and robots expose current public routes", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    const sitemapText = await sitemap.text();
    expect(sitemapText).toContain("/es/trampolin/espana");
    expect(sitemapText).toContain("/en/acrobatic-gymnastics/spain");
    expect(sitemapText).not.toContain("2026-03-26");

    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBeTruthy();
    expect(await robots.text()).toContain("Sitemap:");
  });

  test("contact form posts to API and shows success feedback", async ({ page }) => {
    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { message: "sent" } }),
      });
    });

    await gotoPublic(page, "/contact?type=demo");
    await page.getByLabel("Nombre completo").fill("Laura Demo");
    await page.getByLabel("Email").fill("laura@example.com");
    await page.getByLabel("Mensaje").fill("Quiero revisar Zaltyko para mi academia.");
    const submitButton = page.getByRole("button", { name: /enviar mensaje/i });
    await expectReactHydrated(submitButton);
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // En WebKit, el primer arranque del route handler puede compilar el bundle
    // de contacto en frío; el producto no debe marcar el flujo como fallido
    // por ese coste único del servidor de desarrollo.
    await expect(page.getByText(/Mensaje enviado/i)).toBeVisible({ timeout: 30_000 });
  });

  test("features tabs switch visible content", async ({ page }) => {
    await gotoPublic(page, "/features");
    const billingTab = page.getByRole("tab", { name: "Cobros" });
    await expectReactHydrated(billingTab);
    await billingTab.click();
    await expect(billingTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("Cobros claros para academias");
  });

  test("cluster routes render Spanish and English generated content", async ({ page }) => {
    await gotoPublic(page, "/es/trampolin/espana");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/trampol/i);

    await gotoPublic(page, "/en/acrobatic-gymnastics/spain");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/acrobatic/i);
  });

  test("help center links resolve to real guide pages", async ({ page }) => {
    await gotoPublic(page, "/help");
    const emptyLinks = await page.locator('a[href="#"]').count();
    expect(emptyLinks).toBe(0);

    await expect(page.getByRole("link", { name: "Cómo crear tu cuenta" })).toHaveAttribute(
      "href",
      "/help/crear-cuenta",
    );

    await gotoPublic(page, "/help/crear-cuenta");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cómo crear tu cuenta");
  });

  test("public changelog shows shipped improvements instead of a placeholder", async ({ page }) => {
    await gotoPublic(page, "/changelog");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lo que estamos mejorando en Zaltyko");
    await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Empleo más seguro");
    await expect(page.getByText("Próximamente", { exact: true })).toHaveCount(0);
  });

  test("Starter CTA explains the real self-serve next step", async ({ page }) => {
    await gotoPublic(page, "/pricing");
    const starter = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Starter", exact: true }) });
    await expect(starter.getByRole("link", { name: "Crear cuenta y configurar" })).toHaveAttribute(
      "href",
      "/auth/register?role=owner",
    );
  });

  test("primary signup CTAs distinguish the account from academy setup", async ({ page }) => {
    await gotoPublic(page, "/");
    await expect(page.getByRole("link", { name: "Crear cuenta y configurar academia" }).first()).toHaveAttribute(
      "href",
      "/auth/register?role=owner",
    );

    await gotoPublic(page, "/features");
    await expect(page.getByText(/Crea tu cuenta gratis, configura tu academia/i)).toBeVisible();
  });

  test("service status exposes only live, verifiable checks", async ({ page }) => {
    await gotoPublic(page, "/status");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Estado del servicio");
    await expect(page.getByRole("region", { name: "Estado de los servicios" })).toBeVisible();
    await expect(page.getByText("Auth", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Pagos", { exact: true })).toHaveCount(0);
  });

  test("demo dynamic public detail pages do not depend on remote seed data", async ({ page }) => {
    await gotoPublic(page, "/marketplace/demo-marketplace");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pack demo");

    await gotoPublic(page, "/empleo/demo-empleo");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Entrenador/a de gimnasia");
  });
});
