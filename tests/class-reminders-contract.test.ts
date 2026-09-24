import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const triggerSource = readFileSync("src/lib/email/triggers.ts", "utf8");

describe("recordatorios de clase", () => {
  it("incluye las tres fuentes reales de matrícula", () => {
    expect(triggerSource).toContain("classGroups");
    expect(triggerSource).toContain("groupAthletes");
    expect(triggerSource).toContain("classEnrollments");
    expect(triggerSource).toContain("tenantByClassId");
  });

  it("no comunica clases o atletas eliminados y cuenta solo entregas nuevas", () => {
    expect(triggerSource).toContain("isNull(classes.deletedAt)");
    expect(triggerSource).toContain("isNull(athletes.deletedAt)");
    expect(triggerSource).toContain("if (delivered) sentCount++");
    expect(triggerSource).toContain("dedupeKey: `attendance-reminder:");
  });
});
