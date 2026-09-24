import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/components/billing/DowngradeModal.tsx", import.meta.url), "utf8");

describe("downgrade modal UX contract", () => {
  it("surfaces failed changes and keeps warning surfaces theme-aware", () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain("Downgrade confirmation failed");
    expect(source).not.toMatch(/bg-amber-50(?:\/|\s|[\"])/);
    expect(source).not.toMatch(/bg-blue-50(?:\/|\s|[\"])/);
  });
});
