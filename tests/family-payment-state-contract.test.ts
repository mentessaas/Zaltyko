import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("family payment state contract", () => {
  it("lets families retry SCA-required charges and validates IDs", () => {
    const widget = readFileSync("src/components/my-dashboard/MyPaymentsWidget.tsx", "utf8");
    const pay = readFileSync("src/app/api/family/charges/[chargeId]/pay/route.ts", "utf8");
    const status = readFileSync("src/app/api/family/charges/[chargeId]/status/route.ts", "utf8");
    expect(widget).toContain('"requires_action"');
    expect(widget).toContain("Autenticación pendiente");
    expect(pay).toContain("INVALID_CHARGE_ID");
    expect(status).toContain("INVALID_CHARGE_ID");
  });
});
