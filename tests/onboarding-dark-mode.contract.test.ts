import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Los tres recorridos de bienvenida (entrenadora, familia, gimnasta) usan el
// shell «Magnesio sobre tapiz» y escriben tokens del mundo. Esos tokens son
// seguros de noche por The Night Mat Rule de globals.css: `chalk-field` pasa
// al fondo del tema, `bg-white` a la tarjeta nocturna, `text-mat-night` a la
// tinta y `text-ramp-600` al texto apagado. Antes este contrato pedía
// `bg-background`/`text-foreground`; ahora pide el shell y los tokens.
describe("onboarding dark mode contract", () => {
  it("uses the Magnesio shell and world tokens instead of fixed white backgrounds and navy text", () => {
    const shell = readFileSync("src/components/onboarding/RoleOnboardingShell.tsx", "utf8");
    expect(shell).toContain("chalk-field");
    expect(shell).toContain("text-mat-night");
    expect(shell).toContain("mat-field-deep");

    for (const file of ["parent", "coach", "athlete"]) {
      const source = readFileSync(`src/app/(site)/onboarding/${file}/page.tsx`, "utf8");
      expect(source).toContain("<RoleOnboardingShell>");
      expect(source).toContain("onboardingUi.panel");
      expect(source).not.toContain("bg-zaltyko-white");
      expect(source).not.toContain("text-zaltyko-navy");
      // Sin paleta genérica ni círculos de icono heredados.
      expect(source).not.toMatch(/\b(?:bg|text|border)-(?:gray|slate|amber|red|blue|teal)-\d{2,3}\b/);
      expect(source).not.toContain("zaltyko-teal");
      expect(source).not.toContain("rounded-full bg-zaltyko-primary-ultralight");
    }
  });
});
