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
});
