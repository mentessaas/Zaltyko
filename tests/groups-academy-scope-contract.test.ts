import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("group academy scope", () => {
  it("authorizes collection reads against the requested academy", () => {
    const route = read("src/app/api/groups/route.ts");

    expect(route).toContain("authorizeAcademyCapability");
    expect(route).toContain('permission: "classes:read"');
    expect(route).not.toContain('context.profile.role === "admin" ||');
    expect(route).toContain("isNull(groups.deletedAt)");
  });

  it("authorizes group creation against the academy in the payload", () => {
    const route = read("src/app/api/groups/route.ts");

    expect(route).toContain('permission: "classes:create"');
    expect(route).toContain("academyId: body.academyId");
    expect(route).not.toContain('role !== "super_admin" && tenantId !== context.tenantId');
  });

  it("keeps group athlete reads tenant and academy scoped", () => {
    const route = read("src/app/api/groups/[groupId]/athletes/route.ts");

    expect(route).toContain("authorizeAcademyCapability");
    expect(route).toContain("eq(groupAthletes.tenantId, group.tenantId)");
    expect(route).not.toContain('role === "admin" ||');
  });

  it("limits family conversations to the academy and assigned coach scope", () => {
    const route = read("src/app/api/groups/[groupId]/family-conversation/route.ts");

    expect(route).toContain("authorizeAcademyCapability");
    expect(route).toContain("verifyCoachAthleteScope");
    expect(route).toContain("eq(guardianAthletes.tenantId, group.tenantId)");
    expect(route).toContain("isNull(groups.deletedAt)");
  });

  it("limits athlete family conversations to the academy and assigned coach scope", () => {
    const route = read("src/app/api/athletes/[athleteId]/family-conversation/route.ts");

    expect(route).toContain("authorizeAcademyCapability");
    expect(route).toContain("verifyCoachAthleteScope");
    expect(route).toContain("eq(guardianAthletes.tenantId, athlete.tenantId)");
    expect(route).toContain("isNull(athletes.deletedAt)");
  });

  it("authorizes group mutations against the group academy", () => {
    const route = read("src/app/api/groups/[groupId]/route.ts");

    expect(route).toContain('permission: "classes:update"');
    expect(route).toContain('permission: "classes:delete"');
    expect(route).toContain("isNull(groups.deletedAt)");
  });

  it("authorizes coach resources against the coach academy", () => {
    for (const route of [
      "src/app/api/coaches/[coachId]/route.ts",
      "src/app/api/coaches/[coachId]/athletes/route.ts",
      "src/app/api/coaches/[coachId]/assignments/route.ts",
    ]) {
      const source = read(route);
      expect(source).toContain("authorizeAcademyCapability");
      expect(source).toContain("coach.academyId");
    }
  });

  it("defaults coach listings to an authorized academy and scopes linked profiles", () => {
    const route = read("src/app/api/coaches/route.ts");
    expect(route).toContain("const targetAcademyId = academyId ?? context.profile.activeAcademyId ?? null");
    expect(route).toContain('permission: "coaches:read"');
    expect(route).toContain('permission: "coaches:create"');
    expect(route).toContain("eq(profiles.tenantId, context.tenantId)");
  });

  it("authorizes guardian resources against the athlete academy", () => {
    const collection = read("src/app/api/athletes/[athleteId]/guardians/route.ts");
    const detail = read("src/app/api/athletes/[athleteId]/guardians/[linkId]/route.ts");
    expect(collection).toContain("authorizeAcademyCapability");
    expect(collection).toContain("athleteRow.academyId");
    expect(detail).toContain("authorizeAcademyCapability");
    expect(detail).toContain("athlete.academyId");
  });

  it("authorizes class resources against the class academy", () => {
    const detail = read("src/app/api/classes/[classId]/route.ts");
    const athletes = read("src/app/api/classes/[classId]/athletes/route.ts");
    expect(detail).toContain("authorizeAcademyCapability");
    expect(detail).toContain('permission: "classes:update"');
    expect(detail).toContain('permission: "classes:delete"');
    expect(athletes).toContain("authorizeAcademyCapability");
    expect(athletes).toContain('permission: "classes:read"');
  });

  it("defaults athlete listings to an authorized academy", () => {
    const route = read("src/app/api/athletes/route.ts");
    expect(route).toContain("const targetAcademyId = academyId ?? context.profile.activeAcademyId ?? null");
    expect(route).toContain('permission: "athletes:read"');
    expect(route).toContain("athletes.academyId} = ${targetAcademyId}");
  });

  it("authorizes charge reads, writes and collections against the charge academy", () => {
    for (const route of [
      "src/app/api/charges/route.ts",
      "src/app/api/charges/bulk/route.ts",
      "src/app/api/charges/[chargeId]/route.ts",
      "src/app/api/charges/[chargeId]/status/route.ts",
      "src/app/api/charges/[chargeId]/collect/route.ts",
    ]) {
      expect(read(route)).toContain("authorizeAcademyCapability");
    }
    expect(read("src/app/api/charges/route.ts")).toContain('permission: "billing:read"');
    expect(read("src/app/api/charges/route.ts")).toContain('permission: "billing:create"');
  });

  it("authorizes billing catalog and assistance resources against the academy", () => {
    for (const route of [
      "src/app/api/billing-items/route.ts",
      "src/app/api/billing-items/[itemId]/route.ts",
      "src/app/api/discounts/route.ts",
      "src/app/api/scholarships/route.ts",
    ]) {
      expect(read(route)).toContain("authorizeAcademyCapability");
    }
    expect(read("src/app/api/scholarships/route.ts")).toContain("eq(athletes.academyId, body.academyId)");
  });

  it("keeps technical progress scoped to active athletes and their academy", () => {
    const route = read("src/app/api/assessments/route.ts");
    expect(route).toContain("authorizeAcademyCapability");
    expect(route).toContain("isNull(athletes.deletedAt)");
    expect(route).toContain("targetAcademyId");
  });

  it("keeps athlete classes, history and exports scoped", () => {
    const classes = read("src/app/api/athletes/[athleteId]/classes/route.ts");
    const history = read("src/app/api/athletes/[athleteId]/history/route.ts");
    const exportRoute = read("src/app/api/athletes/[athleteId]/export-history/route.ts");
    expect(classes).toContain("authorizeAcademyCapability");
    expect(classes).toContain("eq(athletes.tenantId, context.tenantId)");
    expect(history).toContain("authorizeAcademyCapability");
    expect(history).toContain("eq(athleteAssessments.academyId, athlete.academyId)");
    expect(exportRoute).toContain("authorizeAcademyCapability");
    expect(exportRoute).toContain("eq(athletes.tenantId, context.tenantId)");
  });

  it("keeps private event reads and deletes academy scoped", () => {
    const route = read("src/app/api/events/[id]/route.ts");
    expect(route).toContain('permission: "events:read"');
    expect(route).toContain('permission: "events:delete"');
    expect(route).toContain("eq(events.tenantId, event.tenantId)");
  });

  it("authorizes event creation and filtered reads against the requested academy", () => {
    const route = read("src/app/api/events/route.ts");
    expect(route).toContain("authorizeAcademyCapability");
    expect(route).toContain('permission: "events:create"');
    expect(route).toContain('permission: "events:read"');
  });

  it("keeps quick actions scoped to authorized active resources", () => {
    const pending = read("src/app/api/quick-actions/pending-today/route.ts");
    const createClass = read("src/app/api/quick-actions/create-class/route.ts");
    expect(pending).toContain("authorizeAcademyCapability");
    expect(pending).toContain('inArray(charges.status, ["pending", "overdue"])');
    expect(createClass).toContain("authorizeAcademyCapability");
    expect(createClass).toContain('permission: "classes:schedule"');
  });
});
