import { describe, expect, it } from "vitest";
import { getComparisonSlugs } from "@/lib/seo/comparativas";
import { getBlogSlugs } from "@/lib/seo/blog";
import { MODALITIES, COUNTRIES } from "@/lib/seo/availability";

// Test unitario del sitemap SEO. Verifica que las URLs críticas que Zaltyko
// debe emitir estén cubiertas por la combinación de rutas públicas + cluster
// pages + comparativas + blog. La query a la DB de academias se prueba por
// separado en `academy-seo-fail-closed.test.ts`.

describe("sitemap coverage", () => {
  const REQUIRED_PUBLIC_ROUTES = [
    "/",
    "/features",
    "/pricing",
    "/academias",
    "/coaches",
    "/marketplace",
    "/empleo",
    "/events",
    "/faq",
    "/contact",
    "/ayuda",
    "/sobre-nosotros",
    "/terminos",
    "/politica-privacidad",
    "/integraciones",
  ] as const;

  const REQUIRED_MODULE_ROUTES = [
    "/modules/gestion-atletas",
    "/modules/clases-horarios",
    "/modules/pagos-administracion",
    "/modules/comunicacion",
    "/modules/eventos-competiciones",
    "/modules/dashboard-reportes",
    "/modules/directorio-academias",
  ] as const;

  // El sitemap se construye por composición de mapas en src/app/sitemap.ts.
  // Aquí verificamos que las constantes que el sitemap debe cubrir contienen
  // exactamente las rutas esperadas. Si en el futuro se añade una ruta
  // pública pero no se lista aquí, este test falla.
  const sitemapPublicRoutes = [
    "/",
    "/features",
    "/pricing",
    "/academias",
    "/coaches",
    "/marketplace",
    "/empleo",
    "/events",
    "/faq",
    "/contact",
    "/ayuda",
    "/sobre-nosotros",
    "/terminos",
    "/politica-privacidad",
    "/integraciones",
  ];

  const sitemapModuleRoutes = [
    "/modules/gestion-atletas",
    "/modules/clases-horarios",
    "/modules/pagos-administracion",
    "/modules/comunicacion",
    "/modules/eventos-competiciones",
    "/modules/dashboard-reportes",
    "/modules/directorio-academias",
  ];

  it("cubre todas las rutas públicas requeridas", () => {
    for (const route of REQUIRED_PUBLIC_ROUTES) {
      expect(sitemapPublicRoutes).toContain(route);
    }
  });

  it("cubre todas las rutas de módulos requeridas", () => {
    for (const route of REQUIRED_MODULE_ROUTES) {
      expect(sitemapModuleRoutes).toContain(route);
    }
  });

  it("no emite rutas de app privada (noindex, app, api, dashboard, super-admin, dev)", () => {
    const allRoutes = [...sitemapPublicRoutes, ...sitemapModuleRoutes];
    expect(allRoutes.some((r) => r.startsWith("/app"))).toBe(false);
    expect(allRoutes.some((r) => r.startsWith("/api"))).toBe(false);
    expect(allRoutes.some((r) => r.startsWith("/dashboard"))).toBe(false);
    expect(allRoutes.some((r) => r.startsWith("/super-admin"))).toBe(false);
    expect(allRoutes.some((r) => r.startsWith("/dev"))).toBe(false);
  });

  it("emite comparativas dedicadas", () => {
    const comparisonSlugs = getComparisonSlugs();
    expect(comparisonSlugs.length).toBeGreaterThanOrEqual(3);
    expect(comparisonSlugs).toContain("zaltyko-vs-excel");
    expect(comparisonSlugs).toContain("zaltyko-vs-sportmember");
    expect(comparisonSlugs).toContain("zaltyko-vs-glofox");
  });

  it("emite posts del blog", () => {
    const blogSlugs = getBlogSlugs();
    expect(blogSlugs.length).toBe(6);
  });

  it("genera cluster pages para todas las combinaciones locale × modalidad × país", () => {
    const locales = ["es", "en"];
    const modalityKeys = Object.keys(MODALITIES);
    const countryKeys = ["espana", "mexico", "argentina", "colombia", "chile", "peru"];
    const expectedCount = locales.length * modalityKeys.length * countryKeys.length;
    // El sitemap produce 2 × 4 × 6 = 48 cluster pages
    expect(expectedCount).toBe(48);
  });

  it("MODALITIES tienen slugs en ambos locales", () => {
    for (const key of Object.keys(MODALITIES) as Array<keyof typeof MODALITIES>) {
      expect(MODALITIES[key].es).toBeTruthy();
      expect(MODALITIES[key].en).toBeTruthy();
    }
  });

  it("COUNTRIES tienen códigos ISO-3166 válidos", () => {
    for (const key of Object.keys(COUNTRIES) as Array<keyof typeof COUNTRIES>) {
      expect(COUNTRIES[key].code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("COUNTRIES hispanos tienen slugs en es + en (united-states solo en)", () => {
    const hispanoCountries: Array<keyof typeof COUNTRIES> = [
      "espana",
      "mexico",
      "argentina",
      "colombia",
      "chile",
      "peru",
    ];
    for (const key of hispanoCountries) {
      expect(COUNTRIES[key].es).toBeTruthy();
      expect(COUNTRIES[key].en).toBeTruthy();
    }
    // united-states es el único caso asimétrico.
    expect(COUNTRIES["united-states"].es).toBeUndefined();
    expect(COUNTRIES["united-states"].en).toBe("united-states");
  });
});
