import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("athlete creation contact requirement", () => {
  it("shows the required family contact section and keeps validation visible", () => {
    const source = readFileSync("src/components/athletes/CreateAthleteDialog.tsx", "utf8");
    expect(source).toContain("useState(false)");
    expect(source).toContain("Datos del contacto familiar · obligatorio");
    expect(source).toContain("setShowAdvanced(true);");
    expect(source).toContain('aria-required="true"');
    expect(source).toContain("Añadir categoría, nivel y estado (opcional)");
    expect(source.indexOf("Contacto familiar — requisito de alta y siempre visible")).toBeLessThan(
      source.indexOf("Opciones menos frecuentes: se pueden completar después")
    );
  });
});
