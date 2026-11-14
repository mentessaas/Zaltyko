import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("family payment state contract", () => {
  it("validates charge IDs in the family payment routes", () => {
    const pay = readFileSync("src/app/api/family/charges/[chargeId]/pay/route.ts", "utf8");
    const status = readFileSync("src/app/api/family/charges/[chargeId]/status/route.ts", "utf8");
    expect(pay).toContain("INVALID_CHARGE_ID");
    expect(status).toContain("INVALID_CHARGE_ID");
  });
});
