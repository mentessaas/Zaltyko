import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/alerts/attendance-alerts.ts", "utf8");

describe("attendance alerts query shape", () => {
  it("agrupa asistencias y contactos antes de recorrer atletas", () => {
    expect(source).toContain("presentRows");
    expect(source).toContain(".groupBy(attendanceRecords.athleteId, attendanceRecords.status)");
    expect(source).toContain("contactsByAthlete");

    const loopStart = source.indexOf("for (const athlete of academyAthletes)");
    expect(loopStart).toBeGreaterThan(0);
    expect(source.slice(loopStart, loopStart + 1200)).not.toContain("await db");
  });

  it("mantiene el filtro de tenant y academia en las consultas agrupadas", () => {
    expect(source).toContain("eq(attendanceRecords.tenantId, tenantId)");
    expect(source).toContain("eq(classSessions.tenantId, tenantId)");
    expect(source).toContain("eq(classes.academyId, academyId)");
    expect(source).toContain("isNull(classes.deletedAt)");
  });
});
