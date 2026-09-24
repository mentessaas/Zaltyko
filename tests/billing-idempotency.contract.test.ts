import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("checkout idempotency contract", () => {
  it("sends a unique key from every billing entry point", () => {
    for (const file of ["src/components/CheckoutButton.tsx", "src/components/billing/BillingPanel.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain('"idempotency-key":');
      expect(source).toContain("crypto.randomUUID()");
    }
  });
});
