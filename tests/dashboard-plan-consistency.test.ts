import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard plan consistency", () => {
  it("uses the same active subscription source for plan name, status and limits", () => {
    const source = readFileSync("src/lib/dashboard.ts", "utf8");
    const planBlock = source.slice(source.indexOf("const plan: DashboardPlanUsage"), source.indexOf("const lookAheadIso"));

    expect(planBlock).toContain("planCode: activePlan.planCode");
    expect(planBlock).toContain("planNickname: activePlan.planNickname ?? null");
    expect(planBlock).toContain("status: activePlan.status ?? \"active\"");
    expect(planBlock).toContain("athleteLimit: activePlan.athleteLimit");
    expect(planBlock).toContain("classLimit: activePlan.classLimit");
    expect(planBlock).not.toContain("subscription?.planCode");
  });

  it("marks a live trial as Starter-compatible trialing state", () => {
    const source = readFileSync("src/lib/limits.ts", "utf8");
    const trialBlock = source.slice(source.indexOf("if (trialIsActive)"), source.indexOf("const [academy]"));

    expect(trialBlock).toContain('planCode: "pro"');
    expect(trialBlock).toContain('status: "trialing"');
  });


  it("does not label every global profile as owner", () => {
    const source = readFileSync("src/components/profiles/OptimizedOwnerProfile.tsx", "utf8");
    expect(source).toContain("formatOwnerProfileRole(currentProfile?.role)");
    expect(source).toContain('case "super_admin":');
    expect(source).not.toContain('>Propietario</Badge>');
  });
});
