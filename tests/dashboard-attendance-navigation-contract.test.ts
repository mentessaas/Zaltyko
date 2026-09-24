import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const todayWidget = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/TodayClassesWidget.tsx"),
  "utf8",
);
const upcomingWidget = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/UpcomingClasses.tsx"),
  "utf8",
);

describe("dashboard attendance navigation contract", () => {
  it("sends today's class CTA straight to the session attendance sheet", () => {
    expect(todayWidget).toContain("/attendance/today/${item.id}");
    expect(todayWidget).toContain("Pasar asistencia");
    expect(todayWidget).not.toContain("router.push");
  });

  it("sends upcoming class CTA straight to the session attendance sheet", () => {
    expect(upcomingWidget).toContain("/attendance/today/${item.id}");
    expect(upcomingWidget).toContain("/classes/${item.classId}");
    expect(upcomingWidget).toContain("Pasar asistencia");
    expect(upcomingWidget).toContain("Ver clase");
    expect(upcomingWidget).toContain("Configurar sesiones");
    expect(upcomingWidget).not.toContain("router.push");
  });
});
