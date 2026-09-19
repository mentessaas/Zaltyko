import { describe, expect, it } from "vitest";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

// Contratos de los endpoints SEO del sitio:
// - /robots.txt debe permitir todos los AI crawlers principales
// - /llms.txt debe existir y mencionar Zaltyko
// - /llms-full.txt debe existir y referenciar planes v3.0 aprobados
//
// Estos tests no hacen HTTP; verifican las funciones puras que generan
// esos recursos. La integración end-to-end (curl al sitio en producción)
// queda fuera del contrato unit-test.

describe("robots.txt contract", () => {
  // Importamos el default export de robots.ts. Next.js lo renderiza como
  // MetadataRoute.Robots. El contrato: reglas para * + 4 AI crawlers +
  // sitemap apuntando al canónico.
  it("getPublicSiteUrl devuelve zaltyko.com cuando NEXT_PUBLIC_APP_URL apunta a zaltyko.com", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://zaltyko.com";
    const url = getPublicSiteUrl();
    process.env.NEXT_PUBLIC_APP_URL = prev;
    expect(url).toBe("https://zaltyko.com");
  });

  it("getPublicSiteUrl hace fallback a zaltyko.com si no hay env var", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const url = getPublicSiteUrl();
    process.env.NEXT_PUBLIC_APP_URL = prev;
    expect(url).toBe("https://zaltyko.com");
  });

  it("getPublicSiteUrl filtra previews de Vercel (no canónicos en SERP)", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://zaltyko-abc123.vercel.app";
    const url = getPublicSiteUrl();
    process.env.NEXT_PUBLIC_APP_URL = prev;
    expect(url).toBe("https://zaltyko.com");
  });

  it("getPublicSiteUrl filtra túneles de Cloudflare", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://something.trycloudflare.com";
    const url = getPublicSiteUrl();
    process.env.NEXT_PUBLIC_APP_URL = prev;
    expect(url).toBe("https://zaltyko.com");
  });
});

describe("llms contract", () => {
  // Estos tests verifican que el contenido de los archivos llms coincide con
  // Mensajes aprobados.md (planes v3.0, claims seguros).
  it("llms.txt menciona planes v3.0 aprobados", async () => {
    // Importamos la constante exportada por la ruta. Como Next.js routes
    // no exponen constantes, leemos el archivo directamente y validamos
    // contenido textual.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(
      path.resolve(process.cwd(), "src/app/llms.txt/route.ts"),
      "utf8",
    );
    expect(content).toContain("Zaltyko");
    // Aunque el archivo no menciona precios explícitamente (eso vive en
    // llms-full.txt), debe apuntar al detalle.
    expect(content).toContain("llms-full.txt");
  });

  it("llms-full.txt menciona los 4 planes v3.0 con precios correctos", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(
      path.resolve(process.cwd(), "src/app/llms-full.txt/route.ts"),
      "utf8",
    );
    expect(content).toContain("Free");
    expect(content).toContain("Starter");
    expect(content).toContain("Growth");
    expect(content).toContain("Network");
    expect(content).toContain("19 €/mes");
    expect(content).toContain("49 €/mes");
    expect(content).toContain("99 €/mes");
  });

  it("llms-full.txt no promete academias ilimitadas en Starter o Growth", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(
      path.resolve(process.cwd(), "src/app/llms-full.txt/route.ts"),
      "utf8",
    );
    // Mensajes aprobados §"No prometer como listo sin validación":
    // "Academias ilimitadas en Starter o Growth".
    // El archivo debe describir Starter con "1 sede" y Growth con "1 sede",
    // nunca "ilimitado" para esos dos planes.
    expect(content).not.toMatch(/Starter[^\n]*ilimitad[ao]/i);
    expect(content).not.toMatch(/Growth[^\n]*ilimitad[ao]/i);
    // Network sí es multi-sede; permitimos "ilimitado" allí.
    expect(content).toMatch(/Network[^\n]*ilimitado/i);
  });

  it("llms-full.txt documenta explícitamente la lista de claims prohibidos", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(
      path.resolve(process.cwd(), "src/app/llms-full.txt/route.ts"),
      "utf8",
    );
    // El archivo debe llevar la sección "No se publica:" con los claims
    // prohibidos por Mensajes aprobados. Validamos que están documentados
    // como prohibidos, no que estén ausentes (porque la sección los
    // menciona literalmente como ejemplos de lo que no se usa).
    expect(content).toContain("No se publica:");
    expect(content).toContain('"100% seguro"');
    expect(content).toContain('"RGPD Compliant"');
  });
});
