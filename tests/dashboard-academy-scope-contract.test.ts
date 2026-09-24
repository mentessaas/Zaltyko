import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const dashboardRoute = readFileSync("src/app/api/dashboard/[academyId]/route.ts", "utf8");
const pendingRoute = readFileSync("src/app/api/quick-actions/pending-today/route.ts", "utf8");
const analyticsRoute = readFileSync("src/app/api/dashboard/[academyId]/analytics/full/route.ts", "utf8");
const popularClassesRoute = readFileSync("src/app/api/dashboard/[academyId]/popular-classes/route.ts", "utf8");

describe("dashboard academy scoping", () => {
  it("rejects malformed academy ids before querying", () => {
    expect(dashboardRoute).toContain("z.string().uuid().safeParse(academyId)");
    expect(dashboardRoute).toContain("verifyAcademyAccessForProfile");
  });

  it("scopes quick actions to the selected academy", () => {
    expect(pendingRoute).toContain('permission: "classes:read"');
    expect(pendingRoute).toContain("authorizeAcademyCapability");
    expect(pendingRoute).toContain("eq(classes.academyId, academyId)");
    expect(pendingRoute).toContain("eq(charges.academyId, academyId)");
    expect(pendingRoute).toContain("eq(athletes.academyId, academyId)");
    expect(pendingRoute).toContain("eq(groups.academyId, academyId)");
  });

  it("calcula el día de operación en la zona horaria de la academia", () => {
    expect(pendingRoute).toContain("getNowInCountryTimezone");
    expect(pendingRoute).toContain("countryCode: academies.countryCode");
  });

  it("no mezcla datos retirados y mantiene el envelope que consume el dashboard", () => {
    expect(analyticsRoute).toContain("isNull(athletes.deletedAt)");
    expect(analyticsRoute).toContain("isNull(classes.deletedAt)");
    expect(analyticsRoute).toContain("return apiSuccess(analytics)");
    expect(analyticsRoute).not.toContain("return apiSuccess({ data: analytics })");
  });

  it("no calcula popularidad con clases o atletas eliminados", () => {
    expect(popularClassesRoute).toContain("isNull(classesTable.deletedAt)");
    expect(popularClassesRoute).toContain("isNull(groups.deletedAt)");
    expect(popularClassesRoute).toContain("isNull(athletes.deletedAt)");
  });
});
