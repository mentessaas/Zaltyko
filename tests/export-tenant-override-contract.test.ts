import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("export tenant override contract", () => {
  it("solo permite tenantId explícito para super-admin", () => {
    for (const file of [
      "src/app/api/transactions/export/route.ts",
      "src/app/api/assessments/export/route.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain('context.profile.role === "super_admin"');
      expect(source).toContain(": context.tenantId");
    }
  });

  it("no exporta atletas eliminados ni vínculos de otro tenant", () => {
    const assessments = readFileSync("src/app/api/assessments/export/route.ts", "utf8");
    expect(assessments).toContain("isNull(athletes.deletedAt)");
    expect(assessments).toContain("eq(athletes.academyId, athleteAssessments.academyId)");
  });
});
