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
  isLimitedAcademyWorkspacePath,
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
    expect(canAccessAcademyWorkspace("owner", "viewer")).toBe(false);
    expect(canAccessAcademyWorkspace("admin", null)).toBe(false);
    expect(canAccessAcademyWorkspace("athlete", "viewer")).toBe(false);
    expect(canAccessAcademyWorkspace("parent", "viewer")).toBe(false);
  });

  it("allows only limited academy paths for athlete and parent portal roles", () => {
    expect(isLimitedAcademyWorkspacePath("/app/academy-1/my-dashboard", "academy-1")).toBe(true);
    expect(isLimitedAcademyWorkspacePath("/app/academy-1/messages", "academy-1")).toBe(true);
    expect(isLimitedAcademyWorkspacePath("/app/academy-1/notifications", "academy-1")).toBe(true);
    expect(isLimitedAcademyWorkspacePath("/app/academy-1/athletes", "academy-1")).toBe(false);
    expect(isLimitedAcademyWorkspacePath("/app/academy-1/billing", "academy-1")).toBe(false);
    expect(isLimitedAcademyWorkspacePath("/app/academy-1/settings", "academy-1")).toBe(false);
    expect(isLimitedAcademyWorkspacePath("/app/academy-1/reports", "academy-1")).toBe(false);
    expect(isLimitedAcademyWorkspacePath("/app/academy-2/my-dashboard", "academy-1")).toBe(false);
  });

  it("builds role-aware global navigation", () => {
    const ownerNav = getGlobalNavigation("owner").map((item) => item.key);
    const coachNav = getGlobalNavigation("coach").map((item) => item.key);
    const providerNav = getGlobalNavigation("provider").map((item) => item.key);

    expect(ownerNav).toContain("academies");
    expect(ownerNav).toContain("team");
    expect(coachNav).toContain("classes");
    expect(coachNav).not.toContain("billing");
    expect(providerNav).toContain("marketplace");
    expect(providerNav).toContain("provider-profile");
    expect(providerNav).not.toContain("academies");
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

  it("builds limited academy navigation for parent roles", () => {
    const parentNav = getAcademyNavigation({
      academyId: "academy-1",
      profileRole: "parent",
      membershipRole: "viewer",
    }).map((item) => item.key);

    expect(parentNav).toEqual(["my-dashboard", "messages", "notifications"]);
  });

  it("does not derive academy privileges from the global profile role", () => {
    const nav = getAcademyNavigation({
      academyId: "academy-1",
      profileRole: "owner",
      membershipRole: "viewer",
    });

    expect(nav).toEqual([]);
  });

  it("keeps the global labels and default homes consistent", () => {
    expect(getRoleLabel("super_admin")).toBe("Super administrador");
    expect(getDefaultDashboardPath("parent")).toBe("/dashboard/profile");
    expect(getRoleLabel("provider")).toBe("Proveedor");
    expect(getDefaultDashboardPath("provider")).toBe("/dashboard/marketplace/mis-productos");
    expect(getSuperAdminNavigation().map((item) => item.key)).toContain("academies");
  });

  it("prefers the academy workspace home when the role can operate inside it", () => {
    expect(
      getPreferredHomePath({
        profileRole: "owner",
        membershipRole: "owner",
        academyId: "academy-1",
      })
    ).toBe("/app/academy-1/dashboard");

    expect(
      getPreferredHomePath({
        profileRole: "coach",
        membershipRole: "coach",
        academyId: "academy-1",
      })
    ).toBe("/app/academy-1/dashboard");

    expect(
      getPreferredHomePath({
        profileRole: "parent",
        membershipRole: "viewer",
        academyId: "academy-1",
      })
    ).toBe("/app/academy-1/my-dashboard");
  });
});
