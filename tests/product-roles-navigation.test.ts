import { describe, expect, it } from "vitest";

import { buildInvitationAcceptancePath } from "@/lib/auth/resolve-user-home";
import {
  getAcademyNavigation,
  getGlobalNavigation,
  getMobileAcademyNavigation,
  getSuperAdminNavigation,
} from "@/lib/navigation/registry";
import {
  canAccessAcademyWorkspace,
  getDefaultDashboardPath,
  getPreferredHomePath,
  getRoleLabel,
} from "@/lib/product/roles";

describe("product roles and navigation", () => {
  it("maps invitation roles to the canonical acceptance paths", () => {
    expect(buildInvitationAcceptancePath("coach", "abc")).toBe("/invite/accept?token=abc");
    expect(buildInvitationAcceptancePath("athlete", "abc")).toBe("/invite/athlete?token=abc");
    expect(buildInvitationAcceptancePath("parent", "abc")).toBe("/invite/parent?token=abc");
  });

  it("restricts academy workspace for athlete and parent roles", () => {
    expect(canAccessAcademyWorkspace("owner", "owner")).toBe(true);
    expect(canAccessAcademyWorkspace("coach", "coach")).toBe(true);
    expect(canAccessAcademyWorkspace("athlete", "viewer")).toBe(false);
    expect(canAccessAcademyWorkspace("parent", "viewer")).toBe(false);
  });

  it("builds role-aware global navigation", () => {
    const ownerNav = getGlobalNavigation("owner").map((item) => item.key);
    const coachNav = getGlobalNavigation("coach").map((item) => item.key);

    expect(ownerNav).toContain("academies");
    expect(ownerNav).toContain("team");
    expect(coachNav).toContain("classes");
    expect(coachNav).not.toContain("billing");
  });

  it("builds academy navigation from the shared registry", () => {
    const ownerNav = getAcademyNavigation({
      academyId: "academy-1",
      profileRole: "owner",
      membershipRole: "owner",
    }).map((item) => item.href);

    const coachMobileNav = getMobileAcademyNavigation({
      academyId: "academy-1",
      profileRole: "coach",
      membershipRole: "coach",
    }).map((item) => item.key);

    expect(ownerNav).toContain("/app/academy-1/billing");
    expect(ownerNav).toContain("/app/academy-1/settings");
    expect(coachMobileNav).not.toContain("reports");
    expect(coachMobileNav).not.toContain("billing");
  });

  it("keeps the global labels and default homes consistent", () => {
    expect(getRoleLabel("super_admin")).toBe("Super administrador");
    expect(getDefaultDashboardPath("parent")).toBe("/dashboard/profile");
    expect(getSuperAdminNavigation().map((item) => item.key)).toContain("academies");
  });

  it("prefers the academy workspace home when the role can operate inside it", () => {
    expect(
      getPreferredHomePath({
        profileRole: "owner",
        academyId: "academy-1",
      })
    ).toBe("/app/academy-1/dashboard");

    expect(
      getPreferredHomePath({
        profileRole: "coach",
        academyId: "academy-1",
      })
    ).toBe("/app/academy-1/dashboard");

    expect(
      getPreferredHomePath({
        profileRole: "parent",
        academyId: "academy-1",
      })
    ).toBe("/dashboard/profile");
  });
});
