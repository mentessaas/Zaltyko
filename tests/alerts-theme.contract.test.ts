import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/components/dashboard/AlertsWidget.tsx", import.meta.url), "utf8");

describe("alerts widget theme contract", () => {
  it("keeps medium alerts and dismiss controls readable in dark mode", () => {
    expect(source).not.toContain("bg-amber-50/");
    expect(source).not.toContain("hover:bg-white");
    // «Magnesio sobre tapiz» (2026-11-09): los avisos medios usan polvo de
    // magnesio en claro y la superficie atenuada del tema en oscuro.
    expect(source).toContain("dark:bg-muted");
    expect(source).toContain("dark:bg-card");
    expect(source).toContain("hover:bg-muted");
  });
});
