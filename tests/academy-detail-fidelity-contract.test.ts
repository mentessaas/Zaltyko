import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("academy detail fidelity and isolation contracts", () => {
  it("does not hydrate coaches, classes or groups from another tenant or archived rows", () => {
    const coachesPage = readFileSync("src/app/app/[academyId]/coaches/page.tsx", "utf8");
    expect(coachesPage).toContain("eq(coaches.tenantId, academy.tenantId)");
    expect(coachesPage).toContain("eq(classCoachAssignments.tenantId, academy.tenantId)");
    expect(coachesPage).toContain("isNull(classes.deletedAt)");
    expect(coachesPage).toContain("isNull(groups.deletedAt)");
  });

  it("preserves group and class technical configuration on detail pages", () => {
    const groupPage = readFileSync("src/app/app/[academyId]/groups/[groupId]/page.tsx", "utf8");
    const classPage = readFileSync("src/app/app/[academyId]/classes/[classId]/page.tsx", "utf8");
    expect(groupPage).toContain("technicalFocus: groups.technicalFocus");
    expect(groupPage).toContain("sportConfigId: groupRow.sportConfigId ?? null");
    expect(groupPage).toContain("isNull(groups.deletedAt)");
    expect(classPage).toContain("technicalFocus: classes.technicalFocus");
    expect(classPage).toContain("sportConfigId: classRow.sportConfigId ?? null");
    expect(classPage).toContain("isNull(classes.deletedAt)");
  });

  it("keeps ticket ownership aligned with profile IDs and the list scope", () => {
    const ticketPage = readFileSync("src/app/app/[academyId]/support/new/page.tsx", "utf8");
    const supportPage = readFileSync("src/app/app/[academyId]/support/page.tsx", "utf8");
    expect(ticketPage).toContain("created_by: profile.id");
    expect(ticketPage).toContain("eq(memberships.userId, user.id)");
    expect(supportPage).toContain("eq(tickets.createdBy, viewer.profileId)");
    expect(supportPage).toContain("canViewAll");
  });
});
