import { expect, test } from "@playwright/test";

/**
 * Public claims audit — L1 (HTTP smoke), L5 (módulos), L6 (JSON-LD / sitemap).
 *
 * Requiere un dev server reachable en BASE_URL (default http://127.0.0.1:3000).
 * Chromium-only para mantenerlo barato. Sigue el patrón de
 * `tests/e2e-zaltyko-public.spec.ts`.
 */

async function gotoPublic(page: import("@playwright/test").Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function fetchJsonLd(page: import("@playwright/test").Page) {
  await gotoPublic(page, "/");
  const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
  return scripts.map((s) => JSON.parse(s));
}

test.describe.configure({ mode: "serial" });
test.describe.configure({ timeout: 180_000 });

test.describe("L1 — HTTP smoke de rutas públicas", () => {
  const PUBLIC_ROUTES = [
    { path: "/", expected: [200, 307] },
    { path: "/pricing", expected: [200] },
    { path: "/features", expected: [200] },
    { path: "/sobre-nosotros", expected: [200] },
    { path: "/ayuda", expected: [200] },
    { path: "/help", expected: [200, 307] },
    { path: "/faq", expected: [200] },
    { path: "/coaches", expected: [200, 307] },
    { path: "/contact", expected: [200] },
    { path: "/academias", expected: [200] },
    { path: "/politica-privacidad", expected: [200] },
    { path: "/terminos", expected: [200] },
    { path: "/status", expected: [200] },
    { path: "/integraciones", expected: [200] },
    { path: "/es", expected: [200, 307] },
    { path: "/es/gimnasia-artistica/espana", expected: [200] },
    { path: "/en/acrobatic-gymnastics/spain", expected: [200] },
    { path: "/empleo", expected: [200] },
    { path: "/events", expected: [200] },
    { path: "/marketplace", expected: [200] },
    { path: "/auth/login", expected: [200] },
    { path: "/auth/register", expected: [200] },
    { path: "/auth/invite", expected: [200] },
    { path: "/blog", expected: [200] },
    { path: "/changelog", expected: [200] },
    { path: "/modules/pagos-administracion", expected: [200] },
    { path: "/modules/clases-horarios", expected: [200] },
    { path: "/modules/comunicacion", expected: [200] },
    { path: "/modules/gestion-atletas", expected: [200] },
    { path: "/modules/eventos-competiciones", expected: [200] },
    { path: "/modules/dashboard-reportes", expected: [200] },
    { path: "/modules/directorio-academias", expected: [200] },
    { path: "/onboarding/athlete", expected: [200] },
    { path: "/onboarding/coach", expected: [200] },
    { path: "/onboarding/parent", expected: [200] },
    // Redirects documentados
    { path: "/login", expected: [200, 307, 308] },
    { path: "/auth/signup", expected: [200, 307, 308] },
    { path: "/about", expected: [200, 307, 308] },
    { path: "/tos", expected: [200, 307, 308] },
    { path: "/privacy-policy", expected: [200, 307, 308] },
  ];

  for (const route of PUBLIC_ROUTES) {
    test(`${route.path} responde ${route.expected.join("/")}`, async ({ request }) => {
      const res = await request.get(route.path, { maxRedirects: 0 });
      expect(
        route.expected,
        `${route.path} devolvió ${res.status()} (esperado ${route.expected.join("/")})`,
      ).toContain(res.status());
    });
  }
});

test.describe("L5 — landings de módulos renderizan H1", () => {
  const MODULES: Array<{ slug: string; keyword: RegExp }> = [
    { slug: "pagos-administracion", keyword: /cobros|cuotas|pagos/i },
    { slug: "clases-horarios", keyword: /clases|horarios/i },
    { slug: "comunicacion", keyword: /comunicaci/i },
    { slug: "gestion-atletas", keyword: /gimnastas?|atletas?/i },
    { slug: "eventos-competiciones", keyword: /eventos|competiciones/i },
    { slug: "dashboard-reportes", keyword: /reportes|dashboard/i },
    { slug: "directorio-academias", keyword: /directorio|academias/i },
  ];

  for (const m of MODULES) {
    test(`/modules/${m.slug} tiene H1 coherente`, async ({ page }) => {
      await gotoPublic(page, `/modules/${m.slug}`);
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toBeVisible();
      const text = (await h1.textContent()) ?? "";
      expect(text, `H1 de /modules/${m.slug} = "${text}"`).toMatch(m.keyword);
    });
  }
});

test.describe("L6 — JSON-LD / sitemap accuracy", () => {
  test("sitemap.xml contiene rutas cluster en ES y EN", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    const text = await sitemap.text();
    expect(text).toContain("/es/trampolin/espana");
    expect(text).toContain("/en/acrobatic-gymnastics/spain");
  });

  test("robots.txt apunta al sitemap", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBeTruthy();
    expect(await robots.text()).toContain("Sitemap:");
  });

  test("JSON-LD del pricing expone precios correctos en EUR", async ({ page }) => {
    await gotoPublic(page, "/pricing");
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allInnerTexts();
    const productLd = scripts
      .map((s) => JSON.parse(s))
      .find((j) => j["@type"] === "Product");
    expect(productLd, "no se encontró Product JSON-LD en /pricing").toBeTruthy();

    const offers = productLd!.offerCatalog.itemListElement as Array<{
      name: string;
      price: string;
      priceCurrency: string;
    }>;
    const map = Object.fromEntries(offers.map((o) => [o.name, o]));

    expect(map.Free?.price).toBe("0");
    expect(map.Free?.priceCurrency).toBe("EUR");
    expect(map.Starter?.price).toBe("19");
    expect(map.Starter?.priceCurrency).toBe("EUR");
    expect(map.Growth?.price).toBe("49");
    expect(map.Growth?.priceCurrency).toBe("EUR");
    expect(map.Network?.price).toBe("99");
    expect(map.Network?.priceCurrency).toBe("EUR");
  });

  test("JSON-LD FAQPage de la home lista 8 preguntas", async ({ page }) => {
    const lds = await fetchJsonLd(page);
    const faqLd = lds.find((j) => j["@type"] === "FAQPage");
    expect(faqLd, "FAQPage JSON-LD ausente en home").toBeTruthy();
    const entities = faqLd!.mainEntity as Array<{ name: string }>;
    expect(entities.length).toBe(8);

    const names = entities.map((e) => e.name);
    expect(names).toContain("¿Para qué modalidades sirve Zaltyko?");
    expect(names).toContain("¿Cumple con la normativa de protección de datos de menores?");
    expect(names).toContain("¿Puedo cancelar en cualquier momento?");
  });

  test("Pricing cards renderizan precios formateados", async ({ page }) => {
    await gotoPublic(page, "/pricing");
    await expect(page.getByText("Incluido", { exact: true })).toBeVisible();
    await expect(page.getByText(/19\s+€\/mes/)).toBeVisible();
    await expect(page.getByText(/49\s+€\/mes/)).toBeVisible();
    await expect(page.getByText(/99\s+€\/mes/)).toBeVisible();
  });

  test("Pricing anual toggle está deshabilitado", async ({ page }) => {
    await gotoPublic(page, "/pricing");
    const anual = page.locator('[aria-disabled="true"]', { hasText: /anual/i });
    await expect(anual).toBeVisible();
    await expect(anual).toContainText(/próximamente/i);
  });

  test("Soporte: emails y horarios presentes", async ({ page }) => {
    await gotoPublic(page, "/contact");
    await expect(page.getByText(/hola@zaltyko\.com/i)).toBeVisible();
    await expect(page.getByText(/9:00 - 18:00 \(CET\)/i)).toBeVisible();
  });
});
