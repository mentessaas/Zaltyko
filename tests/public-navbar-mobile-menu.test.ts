import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public mobile navigation contract", () => {
  const source = readFileSync("src/app/(site)/Navbar.tsx", "utf8");

  it("exposes an accessible, dismissible menu without allowing background scroll", () => {
    expect(source).toContain('aria-controls="public-mobile-menu"');
    expect(source).toContain('id="public-mobile-menu"');
    expect(source).toContain('aria-label="Navegación principal"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('document.body.style.overflow = "hidden"');
    // Velo del menú móvil en noche del sistema «Magnesio sobre tapiz».
    expect(source).toContain('bg-mat-night/40 lg:hidden');
  });

  it("keeps the full navigation out of the tablet-width overlap zone", () => {
    // La navegación completa solo aparece desde lg; la barra es de tapiz.
    expect(source).toContain("gap-1 lg:flex");
    expect(source).toContain("hover:bg-white/10");
    expect(source).toContain("lg:hidden");
    expect(source).not.toContain("md:flex");
  });
});
