import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("charge receipt generation", () => {
  it("creates an idempotent internal receipt for paid charges", () => {
    const helper = readFileSync("src/lib/receipts/ensure-charge-receipt.ts", "utf8");
    const manual = readFileSync("src/app/api/quick-actions/record-payment/route.ts", "utf8");
    const stripe = readFileSync("src/lib/stripe/charge-reconcile-service.ts", "utf8");
    expect(helper).toContain("eq(receipts.chargeId, params.chargeId)");
    expect(helper).toContain("pdfUrl");
    expect(manual).toContain("ensureChargeReceipt");
    expect(stripe).toContain("ensureChargeReceipt");
  });
});
