import { expect, test } from "@playwright/test";

test.describe("Zaltyko public site smoke", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

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

    await page.goto("/contact?type=demo");
    await page.getByLabel("Nombre completo").fill("Laura Demo");
    await page.getByLabel("Email").fill("laura@example.com");
    await page.getByLabel("Mensaje").fill("Quiero revisar Zaltyko para mi academia.");
    await page.getByRole("button", { name: /enviar mensaje/i }).click();

    await expect(page.getByText(/Mensaje enviado/i)).toBeVisible();
  });

  test("features tabs switch visible content", async ({ page }) => {
    await page.goto("/features");
    await page.getByRole("tab", { name: "Facturación" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Cobros claros para academias");
  });

  test("cluster routes render Spanish and English generated content", async ({ page }) => {
    await page.goto("/es/trampolin/espana");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/trampol/i);

    await page.goto("/en/acrobatic-gymnastics/spain");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/acrobatic/i);
  });

  test("help center links resolve to real guide pages", async ({ page }) => {
    await page.goto("/help");
    const emptyLinks = await page.locator('a[href="#"]').count();
    expect(emptyLinks).toBe(0);

    await expect(page.getByRole("link", { name: "Cómo crear tu cuenta" })).toHaveAttribute(
      "href",
      "/help/crear-cuenta",
    );

    await page.goto("/help/crear-cuenta");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cómo crear tu cuenta");
  });

  test("demo dynamic public detail pages do not depend on remote seed data", async ({ page }) => {
    await page.goto("/marketplace/demo-marketplace");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pack demo");

    await page.goto("/empleo/demo-empleo");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Entrenador/a de gimnasia");
  });
});
