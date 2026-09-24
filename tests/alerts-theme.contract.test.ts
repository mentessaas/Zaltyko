import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/components/dashboard/AlertsWidget.tsx", import.meta.url), "utf8");

describe("alerts widget theme contract", () => {
  it("keeps medium alerts and dismiss controls readable in dark mode", () => {
    expect(source).not.toContain("bg-amber-50/");
    expect(source).not.toContain("hover:bg-white");
    expect(source).toContain("bg-amber-500/10");
    expect(source).toContain("hover:bg-muted");
  });
});
