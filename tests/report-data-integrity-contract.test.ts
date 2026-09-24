import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("integridad de datos en reportes", () => {
  it("excluye atletas eliminados de matrículas, grupos y asistencia", () => {
    const source = readFileSync("src/lib/reports/class-report.ts", "utf8");
    expect(source).toContain("isNull(athletes.deletedAt)");
    expect(source).toContain("eq(classEnrollments.athleteId, athletes.id)");
    expect(source).toContain("eq(groupAthletes.athleteId, athletes.id)");
    expect(source).toContain("eq(attendanceRecords.athleteId, athletes.id)");
  });
});
