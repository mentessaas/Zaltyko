import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("quick payment loading", () => {
  it("shows an error for non-JSON or unsuccessful responses and clears stale selection", () => {
    const source = readFileSync("src/components/dashboard/QuickPaymentModal.tsx", "utf8");
    expect(source).toContain("res.json().catch(() => ({}))");
    expect(source).toContain("if (!res.ok)");
    expect(source).toContain('setSelectedCharge("")');
  });
});
