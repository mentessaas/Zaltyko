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
    expect(source).toContain('bg-zaltyko-navy/25 backdrop-blur-[2px]');
  });

  it("keeps the full navigation out of the tablet-width overlap zone", () => {
    expect(source).toContain("shadow-soft lg:flex");
    expect(source).toContain("hover:bg-zaltyko-warm-white");
    expect(source).toContain("lg:hidden");
    expect(source).not.toContain("shadow-soft md:flex");
  });
});
