import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const modal = readFileSync("src/components/dashboard/QuickPaymentModal.tsx", "utf8");
const widget = readFileSync("src/components/dashboard/QuickActionsWidget.tsx", "utf8");
const route = readFileSync("src/app/api/quick-actions/record-payment/route.ts", "utf8");

describe("quick payment academy scope", () => {
  it("passes academy and amount from the selected charge", () => {
    expect(widget).toContain("academyId={academyId}");
    expect(modal).toContain("academyId=${encodeURIComponent(academyId)}");
    expect(modal).toContain("amountCents: selectedChargeData?.amountCents");
  });

  it("requires the charge to belong to the selected academy", () => {
    expect(route).toContain("eq(charges.academyId, academyId)");
    expect(route).toContain("authorizeAcademyCapability");
  });
});
