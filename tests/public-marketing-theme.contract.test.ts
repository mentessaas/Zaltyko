import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("public marketing dark mode", () => {
  it("keeps FAQ, proof cards and comparison table readable in dark mode", () => {
    const files = [
      "src/app/(site)/home/FaqSection.tsx",
      "src/app/(site)/home/TestimonialsSection.tsx",
      "src/app/(site)/home/ComparisonSection.tsx",
      "src/app/(site)/modules/components/ModuleHero.tsx",
      "src/app/(site)/modules/components/ModuleSections.tsx",
      "src/app/(site)/home/SeoExtendedSection.tsx",
      "src/app/(site)/home/SocialProofSection.tsx",
      "src/app/(site)/home/DemoSection.tsx",
      "src/app/(site)/home/ModulesSection.tsx",
      "src/components/motion/Marquee.tsx",
    ];
    for (const file of files) expect(readFileSync(file, "utf8")).toContain("dark:");
    expect(readFileSync(files[0], "utf8")).toContain("dark:bg-background");
    expect(readFileSync(files[1], "utf8")).toContain("dark:bg-card");
    expect(readFileSync(files[2], "utf8")).toContain("dark:bg-card");
    // La barra pública es siempre de tapiz oscuro con texto blanco, en claro y
    // en oscuro, así que no necesita variante dark: propia.
    const navbar = readFileSync("src/app/(site)/Navbar.tsx", "utf8");
    expect(navbar).toContain("mat-field-deep");
    expect(navbar).toContain("text-white");
  });
});
