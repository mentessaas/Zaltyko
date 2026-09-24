import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("financial overdue status contract", () => {
  it("includes explicit overdue charges in every delinquency calculation", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/reports/financial-calculator.ts"),
      "utf8"
    );
    expect(source).toContain('eq(charges.status, "overdue")');
    expect(source).toContain('eq(charges.status, "pending")');
    expect(source.match(/eq\(charges\.status, "overdue"\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
