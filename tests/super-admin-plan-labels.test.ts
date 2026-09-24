import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getProductPlanPublicName } from "@/lib/plans/catalog";

describe("super-admin commercial plan labels", () => {
  it("maps persisted Stripe codes to the current public catalog names", () => {
    expect(getProductPlanPublicName("free", "free")).toBe("Free");
    expect(getProductPlanPublicName("pro", "pro")).toBe("Starter");
    expect(getProductPlanPublicName("premium", "premium")).toBe("Growth");
    expect(getProductPlanPublicName("network", "network")).toBe("Network");
  });

  it("does not leak an internal code when a historical plan is unknown", () => {
    expect(getProductPlanPublicName("legacy_code", "legacy_code")).toBe("Plan personalizado");
    expect(getProductPlanPublicName("custom", "Academia Enterprise")).toBe("Academia Enterprise");
  });

  it("uses the canonical resolver across executive plan surfaces", () => {
    const dashboard = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx",
      "utf8",
    );
    const academies = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminAcademiesTable.tsx",
      "utf8",
    );
    const users = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminUsersTable.tsx",
      "utf8",
    );
    const academyDetail = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminAcademyDetail.tsx",
      "utf8",
    );
    const userDetail = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminUserDetail.tsx",
      "utf8",
    );

    for (const source of [dashboard, academies, users, academyDetail, userDetail]) {
      expect(source).toContain("getProductPlanPublicName");
    }
    expect(dashboard).not.toContain("name: plan.code,");
    expect(users).not.toContain("{user.planCode}");
    expect(academies).not.toContain("{academy.planCode ?? \"Sin plan\"}");
  });
});
