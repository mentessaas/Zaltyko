import { expect, test, type Locator } from "@playwright/test";

const isPublicReadOnlyRun = process.env.E2E_PUBLIC_READ_ONLY === "true";
const configuredBaseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
let blockedPublicApiMutations: string[] = [];
let expectedBlockedPublicApiMutations: string[] = [];

test.beforeEach(async ({ context }) => {
  blockedPublicApiMutations = [];
  expectedBlockedPublicApiMutations = [];

  const targetOrigin = new URL(configuredBaseUrl).origin;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const isReadOnlyMethod = ["GET", "HEAD", "OPTIONS"].includes(
      request.method()
    );

    if (isReadOnlyMethod) {
      await route.continue();
      return;
    }

    if (
      requestUrl.origin === targetOrigin &&
      request.method() === "POST" &&
      requestUrl.pathname === "/api/contact"
    ) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { message: "sent" } }),
      });
      return;
    }

    if (
      requestUrl.origin === targetOrigin &&
      request.method() === "POST" &&
      requestUrl.pathname === "/api/growth/events"
    ) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { accepted: true } }),
      });
      return;
    }

    blockedPublicApiMutations.push(
      `${request.method()} ${requestUrl.origin}${requestUrl.pathname}`
    );
    await route.abort("blockedbyclient");
  });
});

test.afterEach(() => {
  expect(
    blockedPublicApiMutations,
    "public smoke must not mutate application APIs"
  ).toEqual(expectedBlockedPublicApiMutations);
});

async function gotoPublic(page: import("@playwright/test").Page, path: string) {
  // Next dev puede abortar la primera navegación cuando compila una ruta
  // dinámica fría. Reintentamos solo ese error concreto; cualquier otro
  // fallo sigue siendo una regresión real del flujo público.
  try {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED"))
      throw error;
    await page.waitForTimeout(750);
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
  }
  await page
    .waitForLoadState("networkidle", { timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(500);
}

async function expectReactHydrated(locator: Locator) {
  await expect
    .poll(
      () =>
        locator.evaluate((element) =>
          Object.keys(element).some((key) => key.startsWith("__reactProps$"))
        ),
      { timeout: 30_000 }
    )
    .toBe(true);
}

test.describe("Zaltyko public site smoke", () => {
  test.describe.configure({ mode: "serial" });
  test.describe.configure({ timeout: 120_000 });

  test("dynamic sitemap and robots expose current public routes", async ({
    request,
  }) => {
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

  test("priority public pages expose a description and self-canonical URL", async ({
    page,
  }) => {
    const paths = [
      "/",
      "/features",
      "/pricing",
      "/blog",
      "/es/gimnasia-artistica/espana",
    ];

    for (const path of paths) {
      const response = await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      expect(response?.ok(), `${path} should be public`).toBe(true);
      const description = await page
        .locator('meta[name="description"]')
        .getAttribute("content", { timeout: 5_000 });
      expect(description?.trim().length, `${path} description`).toBeGreaterThan(
        20
      );

      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute("href", { timeout: 5_000 });
      expect(canonical, `${path} canonical`).toBeTruthy();
      const actual = new URL(canonical!, "https://zaltyko.com");
      const expected = new URL(path, "https://zaltyko.com");
      expect(actual.origin, `${path} canonical origin`).toBe(expected.origin);
      expect(actual.pathname.replace(/\/$/, ""), `${path} canonical path`).toBe(
        expected.pathname.replace(/\/$/, "")
      );
    }
  });

  test("contact form posts to API and shows success feedback", async ({
    page,
  }) => {
    await gotoPublic(page, "/contact?type=demo");
    await page.getByLabel("Nombre completo").fill("Laura Demo");
    await page.getByLabel("Email").fill("laura@example.com");
    await page
      .getByLabel("Mensaje")
      .fill("Quiero revisar Zaltyko para mi academia.");
    const submitButton = page.getByRole("button", { name: /enviar mensaje/i });
    await expectReactHydrated(submitButton);
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // En WebKit, el primer arranque del route handler puede compilar el bundle
    // de contacto en frío; el producto no debe marcar el flujo como fallido
    // por ese coste único del servidor de desarrollo.
    await expect(page.getByText(/Mensaje enviado/i)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("read-only mode mocks contact submissions without sending them to the server", async ({
    page,
  }) => {
    test.skip(
      !isPublicReadOnlyRun,
      "This contact isolation probe runs only in explicit read-only mode."
    );
    await gotoPublic(page, "/");

    const response = await page.evaluate(async () => {
      const result = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Public smoke probe",
          email: "smoke@example.test",
          message: "test",
        }),
      });
      return { status: result.status, payload: await result.json() };
    });

    expect(response).toEqual({
      status: 201,
      payload: { ok: true, data: { message: "sent" } },
    });
    expect(blockedPublicApiMutations).toEqual([]);
  });

  test("read-only mode mocks public growth events without recording analytics", async ({
    page,
  }) => {
    test.skip(
      !isPublicReadOnlyRun,
      "This analytics isolation probe runs only in explicit read-only mode."
    );
    await gotoPublic(page, "/");

    const response = await page.evaluate(async () => {
      const result = await fetch("/api/growth/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventName: "public_page_view",
          eventId: "public-smoke-probe",
          visitorId: "public-smoke-probe",
          source: "public_smoke",
        }),
      });
      return { status: result.status, payload: await result.json() };
    });

    expect(response).toEqual({
      status: 201,
      payload: { ok: true, data: { accepted: true } },
    });
    expect(blockedPublicApiMutations).toEqual([]);
  });

  test("read-only mode aborts other mutating API requests before they reach the server", async ({
    page,
  }) => {
    test.skip(
      !isPublicReadOnlyRun,
      "This network guard probe runs only in explicit read-only mode."
    );
    expectedBlockedPublicApiMutations = [
      `POST ${new URL(configuredBaseUrl).origin}/api/public-smoke-read-only-probe`,
    ];
    await gotoPublic(page, "/");

    const requestWasAborted = await page.evaluate(async () => {
      try {
        await fetch("/api/public-smoke-read-only-probe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ probe: true }),
        });
        return false;
      } catch {
        return true;
      }
    });

    expect(requestWasAborted).toBe(true);
    expect(blockedPublicApiMutations).toEqual(
      expectedBlockedPublicApiMutations
    );
  });

  test("features tabs switch visible content", async ({ page }) => {
    await gotoPublic(page, "/features");
    const billingTab = page.getByRole("tab", { name: "Cobros" });
    await expectReactHydrated(billingTab);
    await billingTab.click();
    await expect(billingTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText(
      "Cobros claros para academias"
    );
  });

  test("cluster routes render Spanish and English generated content", async ({
    page,
  }) => {
    await gotoPublic(page, "/es/trampolin/espana");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /trampol/i
    );

    await gotoPublic(page, "/en/acrobatic-gymnastics/spain");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /acrobatic/i
    );
  });

  test("help center links resolve to real guide pages", async ({ page }) => {
    await gotoPublic(page, "/help");
    const emptyLinks = await page.locator('a[href="#"]').count();
    expect(emptyLinks).toBe(0);

    await expect(
      page.getByRole("link", { name: "Cómo crear tu cuenta" })
    ).toHaveAttribute("href", "/help/crear-cuenta");

    await gotoPublic(page, "/help/crear-cuenta");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Cómo crear tu cuenta"
    );
  });

  test("public changelog shows shipped improvements instead of a placeholder", async ({
    page,
  }) => {
    await gotoPublic(page, "/changelog");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Lo que estamos mejorando en Zaltyko"
    );
    await expect(page.getByRole("heading", { level: 2 }).first()).toContainText(
      "Empleo más seguro"
    );
    await expect(page.getByText("Próximamente", { exact: true })).toHaveCount(
      0
    );
  });

  test("Starter CTA explains the real self-serve next step", async ({
    page,
  }) => {
    await gotoPublic(page, "/pricing");
    const starter = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "Starter", exact: true }),
    });
    await expect(
      starter.getByRole("link", { name: "Crear cuenta y configurar" })
    ).toHaveAttribute("href", "/auth/register?role=owner");
  });

  test("primary signup CTAs distinguish the account from academy setup", async ({
    page,
  }) => {
    await gotoPublic(page, "/");
    await expect(
      page
        .getByRole("link", { name: "Crear cuenta y configurar academia" })
        .first()
    ).toHaveAttribute("href", "/auth/register?role=owner");

    await gotoPublic(page, "/features");
    await expect(
      page.getByText(/Crea tu cuenta gratis, configura tu academia/i)
    ).toBeVisible();
  });

  test("service status exposes only live, verifiable checks", async ({
    page,
  }) => {
    await gotoPublic(page, "/status");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Estado del servicio"
    );
    await expect(
      page.getByRole("region", { name: "Estado de los servicios" })
    ).toBeVisible();
    await expect(page.getByText("Auth", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Pagos", { exact: true })).toHaveCount(0);
  });

  test("demo dynamic public detail pages do not depend on remote seed data", async ({
    page,
  }) => {
    await gotoPublic(page, "/marketplace/demo-marketplace");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Pack demo"
    );

    await gotoPublic(page, "/empleo/demo-empleo");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Entrenador/a de gimnasia"
    );
  });
});
