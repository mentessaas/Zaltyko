import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("authenticated empty states theme", () => {
  it("does not force white surfaces in dark mode", () => {
    const app = readFileSync("src/app/app/page.tsx", "utf8");
    const whatsapp = readFileSync("src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx", "utf8");
    expect(app).toContain("dark:bg-card");
    expect(whatsapp).toContain("dark:bg-green-950/40");
    expect(whatsapp).toContain("dark:text-green-300");
  });
});
