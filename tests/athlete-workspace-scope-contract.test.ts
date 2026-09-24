import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("alcance de los espacios de progreso", () => {
  it("no permite resolver una gimnasta fuera de la academia de la URL", () => {
    const progress = readFileSync(
      join(process.cwd(), "src/app/app/[academyId]/athletes/[athleteId]/progress/page.tsx"),
      "utf8"
    );
    const evaluate = readFileSync(
      join(process.cwd(), "src/app/app/[academyId]/athletes/[athleteId]/evaluate/page.tsx"),
      "utf8"
    );

    expect(progress).toContain("eq(athletes.academyId, academyId)");
    expect(progress).toContain("eq(athleteAssessments.academyId, academyId)");
    expect(progress).not.toContain("profile.tenantId === athleteRow.tenantId ||");
    expect(evaluate).toContain("eq(athletes.academyId, academyId)");
    expect(evaluate).not.toContain("profile.tenantId === athleteRow.tenantId ||");
  });

  it("mantiene tenant y academia en historial y panel de coach", () => {
    const history = readFileSync(
      join(process.cwd(), "src/app/app/[academyId]/athletes/[athleteId]/history/page.tsx"),
      "utf8"
    );
    const coach = readFileSync(
      join(process.cwd(), "src/app/app/[academyId]/coach/page.tsx"),
      "utf8"
    );

    expect(history).toContain("await supabase.auth.getUser()");
    expect(history).toContain("eq(athleteAssessments.tenantId, athlete.tenantId)");
    expect(history).toContain("eq(athleteAssessments.academyId, academyId)");
    expect(coach).toContain("eq(classCoachAssignments.tenantId, academy.tenantId)");
    expect(coach).toContain("eq(classes.academyId, academyId)");
    expect(coach).toContain("eq(athleteAssessments.tenantId, academy.tenantId)");
  });

  it("no devuelve atletas eliminados al resolver el portal familiar", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/family/scope-service.ts"),
      "utf8"
    );

    expect(source).toContain("isNull(athletes.deletedAt)");
    expect(source).toContain("lower(${familyContacts.email}) = ${parentEmail}");
  });

  it("no muestra un KPI de borradores cuando la fuente de estados no existe", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/dashboard/OwnerAttentionPanel.tsx"),
      "utf8"
    );

    expect(source).toContain("bundle.progressDrafts.sourceAvailable ? (");
    expect(source).not.toContain("sourceAvailable={bundle.progressDrafts.sourceAvailable}");
  });
});
