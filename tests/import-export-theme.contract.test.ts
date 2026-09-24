import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/components/athletes/ImportExportPanel.tsx", import.meta.url), "utf8");

describe("athlete import UX contract", () => {
  it("keeps rollback and error states readable in dark mode", () => {
    expect(source).not.toContain("bg-amber-50/");
    expect(source).not.toContain("text-amber-950");
    expect(source).toContain("bg-amber-500/10");
    expect(source).toContain('aria-live="polite"');
  });
});
