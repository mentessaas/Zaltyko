import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard session/template semantics", () => {
  it("does not present recurring templates as sessions scheduled this week", () => {
    const dashboard = readFileSync("src/lib/dashboard.ts", "utf8");
    const page = readFileSync("src/components/dashboard/DashboardPage.tsx", "utf8");

    expect(dashboard).toContain("classesThisWeek: Number(classesWeekCount ?? 0)");
    expect(dashboard).toContain("classTemplates: Number(classTemplatesCount ?? 0)");
    expect(dashboard).not.toContain("classesMetric");
    expect(page).toContain("entrenamientos base");
    expect(page).toContain("genera sus sesiones para abrir la semana");
  });
});
