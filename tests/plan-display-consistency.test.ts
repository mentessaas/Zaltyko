import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const userFacingPlanSources = [
  "src/components/onboarding/steps/AcademyStep.tsx",
  "src/components/onboarding/LimitIndicator.tsx",
  "src/components/billing/BillingPanel.tsx",
  "src/components/billing/BillingSummary.tsx",
  "src/components/billing/PlanSelector.tsx",
  "src/components/dashboard/PlanUsage.tsx",
  "src/components/academy/AcademySidebar.tsx",
  "src/components/profiles/OptimizedOwnerProfile.tsx",
  "src/app/dashboard/account-form.tsx",
  "src/hooks/use-realtime-notifications.ts",
  "src/app/api/profile/adjust-plan-limits/route.ts",
  "src/app/api/super-admin/users/[profileId]/route.ts",
  "src/app/api/athletes/route.ts",
  "src/lib/mcp/tools/user-tools.ts",
];

describe("commercial plan display consistency", () => {
  it("routes visible plan names through the canonical public resolver", () => {
    for (const path of userFacingPlanSources) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain("getProductPlanPublicName");
    }
  });

  it("does not format persisted plan codes as user-facing labels", () => {
    for (const path of userFacingPlanSources) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/(?:planCode|plan\.code|upgradeTo)\.toUpperCase\(\)/);
    }
  });
});
