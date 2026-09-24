import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("classes calendar and stats contract", () => {
  it("keeps the calendar CTA connected to the real, academy-scoped calendar", () => {
    const dashboard = readFileSync("src/components/classes/ClassesDashboard.tsx", "utf8");
    const calendar = readFileSync("src/app/dashboard/calendar/page.tsx", "utf8");

    expect(dashboard).toContain("/dashboard/calendar?academyId=");
    expect(calendar).toContain("requestedAcademyId");
    expect(calendar).toContain("calendarAcademyId ? eq(classes.academyId, calendarAcademyId)");
  });

  it("renders real zero-valued session metrics instead of an implementation placeholder", () => {
    const page = readFileSync("src/app/app/[academyId]/classes/page.tsx", "utf8");
    const dashboard = readFileSync("src/components/classes/ClassesDashboard.tsx", "utf8");

    expect(page).toContain("initialStats={sessionStats}");
    expect(page).toContain("count()");
    expect(dashboard).toContain("value={stats.totalSessions}");
    expect(dashboard).toContain("value={stats.upcomingSessions}");
    expect(dashboard).not.toContain('value={stats.totalSessions > 0 ? stats.totalSessions : "—"}');
    expect(dashboard).not.toContain("totalSessions: 0, // Se calcularía con datos de sesiones");
  });

  it("preserves schedule and operating settings on the initial server render", () => {
    const page = readFileSync("src/app/app/[academyId]/classes/page.tsx", "utf8");

    expect(page).toContain("startTime: classes.startTime");
    expect(page).toContain("capacity: classes.capacity");
    expect(page).toContain("autoGenerateSessions: classes.autoGenerateSessions");
    expect(page).toContain("startTime: item.startTime");
    expect(page).toContain("createdAt: item.createdAt?.toISOString() ?? null");
    expect(page).not.toContain("startTime: null,");
    expect(page).not.toContain("capacity: null,");
  });
});
