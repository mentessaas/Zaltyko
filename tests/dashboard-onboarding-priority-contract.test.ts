import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard onboarding priority contract", () => {
  const source = readFileSync("src/components/dashboard/DashboardPage.tsx", "utf8");

  it("places the next step immediately after the KPI block", () => {
    const kpiEnd = source.indexOf("      <OperationsPulse");
    const onboarding = source.indexOf("<DashboardOnboardingPanel");
    const quickActions = source.indexOf("<QuickActionsWidget");

    expect(kpiEnd).toBeGreaterThan(-1);
    expect(onboarding).toBeGreaterThan(-1);
    expect(onboarding).toBeLessThan(kpiEnd);
    expect(onboarding).toBeLessThan(quickActions);
  });
});
