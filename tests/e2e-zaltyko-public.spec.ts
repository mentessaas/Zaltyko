import { expect, test, type Locator } from "@playwright/test";

async function gotoPublic(page: import("@playwright/test").Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
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
    await submitButton.click();

    await expect(page.getByText(/Mensaje enviado/i)).toBeVisible({ timeout: 15_000 });
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

  test("demo dynamic public detail pages do not depend on remote seed data", async ({ page }) => {
    await gotoPublic(page, "/marketplace/demo-marketplace");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pack demo");

    await gotoPublic(page, "/empleo/demo-empleo");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Entrenador/a de gimnasia");
  });
});
