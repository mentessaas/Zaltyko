import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

// Verifica que .lighthouserc.json existe, es JSON válido, y que las URLs
// auditadas coinciden con las 5 paginas SEO clave definidas en el plan.
// Esto evita que un PR que elimine paginas del sitemap publique un lhci
// config que audite rutas inexistentes (silencioso).
describe(".lighthouserc.json contract", () => {
  let config: {
    ci: {
      collect: { url: string[]; settings: { preset?: string; chromeFlags?: string } };
      assert: { assertions: Record<string, [string, Record<string, number>]> };
    };
  };

  it("existe y es JSON valido", async () => {
    const raw = await fs.readFile(
      path.resolve(process.cwd(), ".lighthouserc.json"),
      "utf8",
    );
    expect(() => JSON.parse(raw)).not.toThrow();
    config = JSON.parse(raw);
    expect(config.ci).toBeDefined();
  });

  it("audita exactamente las 5 paginas SEO clave", async () => {
    if (!config) {
      const raw = await fs.readFile(
        path.resolve(process.cwd(), ".lighthouserc.json"),
        "utf8",
      );
      config = JSON.parse(raw);
    }
    const urls = config.ci.collect.url;
    expect(urls).toContain("http://localhost:3000/");
    expect(urls).toContain("http://localhost:3000/pricing");
    expect(urls).toContain("http://localhost:3000/features");
    expect(urls).toContain(
      "http://localhost:3000/blog/migrar-excel-software-academia-gimnasia",
    );
    expect(urls).toContain(
      "http://localhost:3000/es/gimnasia-artistica/espana",
    );
    expect(urls.length).toBe(5);
  });

  it("SEO es hard-fail (error) con minScore >= 0.95", async () => {
    if (!config) {
      const raw = await fs.readFile(
        path.resolve(process.cwd(), ".lighthouserc.json"),
        "utf8",
      );
      config = JSON.parse(raw);
    }
    const seoAssert = config.ci.assert.assertions["categories:seo"];
    expect(seoAssert).toBeDefined();
    expect(seoAssert![0]).toBe("error");
    expect(seoAssert![1].minScore).toBeGreaterThanOrEqual(0.95);
  });

  it("performance/a11y/best-practices son warn (no rompen CI)", async () => {
    if (!config) {
      const raw = await fs.readFile(
        path.resolve(process.cwd(), ".lighthouserc.json"),
        "utf8",
      );
      config = JSON.parse(raw);
    }
    for (const key of [
      "categories:performance",
      "categories:accessibility",
      "categories:best-practices",
    ]) {
      const a = config.ci.assert.assertions[key];
      expect(a).toBeDefined();
      expect(a![0]).toBe("warn");
    }
  });

  it("corre 3 runs por pagina para suavizar flakiness", async () => {
    if (!config) {
      const raw = await fs.readFile(
        path.resolve(process.cwd(), ".lighthouserc.json"),
        "utf8",
      );
      config = JSON.parse(raw);
    }
    expect(config.ci.collect.numberOfRuns).toBeGreaterThanOrEqual(3);
  });

  it("usa preset desktop (las paginas SEO son desktop-first)", async () => {
    if (!config) {
      const raw = await fs.readFile(
        path.resolve(process.cwd(), ".lighthouserc.json"),
        "utf8",
      );
      config = JSON.parse(raw);
    }
    expect(config.ci.collect.settings.preset).toBe("desktop");
  });
});
