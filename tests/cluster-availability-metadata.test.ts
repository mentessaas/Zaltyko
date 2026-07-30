import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  join(
    process.cwd(),
    "src/app/(site)/[locale]/[modality]/[country]/page.tsx"
  ),
  "utf8"
);
const modalityRouteSource = readFileSync(
  join(process.cwd(), "src/app/(site)/[locale]/[modality]/page.tsx"),
  "utf8"
);

describe("country cluster availability metadata", () => {
  it("gates JSON keywords behind the modality availability flag", () => {
    expect(routeSource).toMatch(
      /keywords:\s*isAvailable\s*\?\s*content\.meta\.keywords\s*:\s*unavailableCopy\.keywords/
    );
  });

  it.each([
    ["es", "academias de gimnasia"],
    ["en", "gymnastics academies"],
  ])("keeps neutral unavailable keywords for %s", (_locale, neutralKeyword) => {
    expect(routeSource).toContain(`"${neutralKeyword}"`);
  });

  it("keeps the owner registration CTA for every modality", () => {
    expect(modalityRouteSource).toContain(
      'href="/auth/register?role=owner"'
    );
    expect(modalityRouteSource).not.toContain('href="/contact?type=demo"');
    expect(modalityRouteSource).toContain('cta: "Crear academia gratis"');
    expect(modalityRouteSource).toContain('cta: "Create free academy"');
  });
});
