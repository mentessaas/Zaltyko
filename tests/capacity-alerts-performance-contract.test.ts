import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/alerts/capacity-alerts.ts", "utf8");

describe("capacity alerts query shape", () => {
  it("procesa clases en lotes acotados para evitar latencia secuencial", () => {
    expect(source).toContain("const BATCH_SIZE = 8");
    expect(source).toContain("await Promise.all(");
    expect(source).toContain("getClassAthletes(classGroup.classId, academyId)");
  });

  it("no incluye clases o grupos eliminados y conserva el scope tenant", () => {
    expect(source).toContain("eq(classes.tenantId, tenantId)");
    expect(source).toContain("isNull(classes.deletedAt)");
    expect(source).toContain("isNull(groups.deletedAt)");
  });
});
