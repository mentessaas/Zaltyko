import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("contrato del cierre del mapa de objeciones", () => {
  it("mantiene los artefactos de cierre y aceptación", () => {
    const matrix = read("docs/plans/2026-07-23-objection-closure-matrix.md");
    const runbook = read("docs/plans/2026-07-23-objection-closure-runbook.md");

    expect(matrix).toContain("Matriz de cierre de objeciones");
    expect(matrix).toContain("El mapa queda cerrado");
    expect(runbook).toContain("Owner");
    expect(runbook).toContain("Evidencia requerida");
    expect(runbook).toContain("No se publica ROI");
  });


  it("no reintroduce claims retirados en la superficie pública", () => {
    const siteFiles = [
      "src/app/(site)/FeaturesSection.tsx",
      "src/app/(site)/modules/comunicacion/page.tsx",
      "src/app/(site)/modules/eventos-competiciones/page.tsx",
    ].map(read).join("\n");

    expect(siteFiles).not.toContain("100% seguro");
    expect(siteFiles).not.toContain("listados oficiales para federaciones");
    expect(siteFiles).not.toContain("inscripciones sin errores");
  });
});
