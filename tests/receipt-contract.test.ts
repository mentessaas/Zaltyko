import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("receipt endpoints", () => {
  it("validate identifiers and keep amounts in consistent units", () => {
    const list = readFileSync("src/app/api/receipts/route.ts", "utf8");
    const item = readFileSync("src/app/api/receipts/[receiptId]/route.ts", "utf8");
    const family = readFileSync("src/app/api/family/charges/[chargeId]/receipt/route.ts", "utf8");
    const creator = readFileSync("src/lib/receipts/ensure-charge-receipt.ts", "utf8");
    expect(list).toContain("z.string().uuid()");
    expect(list).toContain(".leftJoin(athletes");
    expect(item).toContain("INVALID_RECEIPT_ID");
    expect(family).toContain("INVALID_CHARGE_ID");
    expect(creator).toContain("charge.amountCents / 100");
  });
});
