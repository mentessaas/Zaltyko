import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/components/billing/InvoiceList.tsx", import.meta.url), "utf8");

describe("invoice list UX contract", () => {
  it("keeps status badges readable across themes and sync safe", () => {
    expect(source).toContain("bg-emerald-500/15");
    expect(source).toContain("bg-blue-500/15");
    expect(source).not.toContain("bg-green-100");
    expect(source).toContain('<button\n            type="button"');
  });
});
