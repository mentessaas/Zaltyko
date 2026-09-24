import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  addDaysToCalendarDate,
  formatDateToISOString,
  formatDateForCountry,
  parseCalendarDate,
  getStartOfDayInTimezone,
  getWeekCalendarDateKeys,
  isTodayInCountryTimezone,
} from "@/lib/date-utils";
import { getCurrencyForCountry } from "@/lib/currency";
import { resolveAcademyTimezone } from "@/lib/dashboard/attention-bundle";

describe("international date boundary contract", () => {
  it("derives calendar keys from the academy timezone", () => {
    const lateUtc = new Date("2026-09-13T23:30:00.000Z");

    expect(formatDateToISOString(lateUtc, "ES")).toBe("2026-09-14");
    expect(formatDateToISOString(lateUtc, "MX")).toBe("2026-09-13");
    expect(formatDateToISOString(lateUtc, "México")).toBe("2026-09-13");
    expect(formatDateToISOString(lateUtc, "Perú")).toBe("2026-09-13");
    expect(getCurrencyForCountry("Puerto Rico")).toBe("USD");
    expect(formatDateForCountry("2026-09-13", "México", "yyyy-MM-dd")).toBe("2026-09-13");
    expect(
      formatDateToISOString(getStartOfDayInTimezone("2026-09-13", "México"), "México")
    ).toBe("2026-09-13");
    expect(addDaysToCalendarDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(parseCalendarDate("2026-02-29")).toBeNull();
    expect(isTodayInCountryTimezone("2026-02-30", "México")).toBe(false);
    expect(
      getWeekCalendarDateKeys(new Date("2026-09-13T23:30:00.000Z"), "America/Mexico_City")
    ).toEqual({ start: "2026-09-07", end: "2026-09-13" });
    expect(
      getWeekCalendarDateKeys(new Date("2026-09-13T23:30:00.000Z"), "Europe/Madrid")
    ).toEqual({ start: "2026-09-14", end: "2026-09-20" });
  });

  it("prefers the academy timezone and falls back to its country", () => {
    expect(
      resolveAcademyTimezone({
        timezone: "America/Argentina/Buenos_Aires",
        countryCode: "ES",
        country: "España",
      })
    ).toBe("America/Argentina/Buenos_Aires");
    expect(resolveAcademyTimezone({ countryCode: "MX", country: "México" })).toBe(
      "America/Mexico_City"
    );
    expect(resolveAcademyTimezone({ country: "España" })).toBe("Europe/Madrid");
  });

  it("falls back safely when an academy stores an invalid timezone", () => {
    expect(
      resolveAcademyTimezone({ timezone: "Not/A_Timezone", countryCode: "CO" })
    ).toBe("America/Bogota");
  });

  it("uses academy-local date keys in attendance and coach dashboards", () => {
    const attendancePage = readFileSync(
      "src/app/app/[academyId]/attendance/today/page.tsx",
      "utf8"
    );
    const coachPage = readFileSync(
      "src/app/app/[academyId]/coach/page.tsx",
      "utf8"
    );
    const familyPage = readFileSync(
      "src/app/app/[academyId]/my-dashboard/page.tsx",
      "utf8"
    );
    const coachTodayPage = readFileSync(
      "src/app/app/[academyId]/coaches/today/page.tsx",
      "utf8"
    );

    expect(attendancePage).toContain(
      "formatDateToISOString(new Date(), academy.country)"
    );
    expect(coachPage).toContain(
      "formatDateToISOString(new Date(), academy.country)"
    );
    expect(familyPage).toContain(
      "formatDateToISOString(today, academy.country)"
    );
    expect(familyPage).not.toContain(
      'new Date().toISOString().split("T")[0]'
    );
    expect(coachTodayPage).toContain(
      "formatDateToISOString(new Date(), academy.country)"
    );
    expect(coachTodayPage).toContain("or(eq(coaches.profileId, profile.id)");

    const dashboard = readFileSync("src/lib/dashboard.ts", "utf8");
    const trends = readFileSync("src/lib/dashboard/kpi-trends.ts", "utf8");
    expect(dashboard).toContain("formatDateToISOString(now, academy.country)");
    expect(dashboard).toContain("addDaysToCalendarDate(nowIso, -7)");
    expect(dashboard).toContain("getWeekCalendarDateKeys(new Date(), academyTimezone)");
    expect(dashboard).toContain("classTemplates: Number(classTemplatesCount ?? 0)");
    expect(dashboard).not.toContain("const classesMetric =");
    expect(trends).toContain("formatDateToISOString(new Date(), academyCountry)");
    expect(trends).toContain("addDaysToCalendarDate(todayKey, -i)");
  });

  it("queries class sessions by their calendar date, not a UTC timestamp", () => {
    const attentionBundle = readFileSync(
      "src/lib/dashboard/attention-bundle.ts",
      "utf8"
    );

    expect(attentionBundle).toContain("eq(classSessions.sessionDate, date)");
    expect(attentionBundle).not.toContain("gte(classSessions.sessionDate, dayStart)");
    expect(attentionBundle).not.toContain("lte(classSessions.sessionDate, dayEnd)");
  });

  it("does not parse session date-only values as UTC browser instants", () => {
    const source = readFileSync(
      "src/components/my-dashboard/MyScheduleWidget.tsx",
      "utf8"
    );

    expect(source).toContain("new Date(Date.UTC(year, month - 1, day))");
    expect(source).toContain("date.getUTCDay()");
    expect(source).not.toContain("new Date(dateStr)");
  });

  it("keeps recurring-session date keys independent from process timezone", () => {
    const generator = readFileSync("src/lib/sessions-generator.ts", "utf8");
    const dialog = readFileSync("src/components/classes/GenerateSessionsDialog.tsx", "utf8");

    expect(generator).toContain("parseCalendarDate(startDate)");
    expect(generator).toContain("currentDate.getUTCDay()");
    expect(generator).toContain("formatCalendarDate(currentDate)");
    expect(generator).toContain("created: createdSessions.length");
    expect(dialog).toContain("parseCalendarDate(startDate)");
    expect(dialog).toContain("formatDateToISOString(new Date(), academyCountry)");
    expect(dialog).not.toContain('start.toISOString().split("T")[0]');

    const generationRoute = readFileSync(
      "src/app/api/classes/[classId]/generate-sessions/route.ts",
      "utf8"
    );
    expect(generationRoute).toContain("startDate: z.string().date()");
    expect(generationRoute).toContain("endDate: z.string().date()");

    const reportFilters = readFileSync("src/components/reports/ReportFilters.tsx", "utf8");
    expect(reportFilters).toContain("formatDateToISOString(new Date(), academyCountry)");
    expect(reportFilters).toContain("addDaysToCalendarDate(todayKey, -30)");
    const dateUtils = readFileSync("src/lib/date-utils.ts", "utf8");
    expect(dateUtils).toContain('date === formatDateToISOString(new Date(), country)');

    const classesDashboard = readFileSync("src/components/classes/ClassesDashboard.tsx", "utf8");
    const calendarPage = readFileSync("src/app/dashboard/calendar/page.tsx", "utf8");
    expect(classesDashboard).toContain("/dashboard/calendar?academyId=");
    expect(calendarPage).toContain("requestedAcademyId");
    expect(calendarPage).toContain("calendarAcademyId ? eq(classes.academyId, calendarAcademyId)");
    const classesPage = readFileSync("src/app/app/[academyId]/classes/page.tsx", "utf8");
    expect(classesPage).toContain("isNull(classes.deletedAt)");
    expect(classesPage).toContain("eq(classes.tenantId, academy.tenantId)");
  });

  it("does not present an arbitrary revenue forecast as a product metric", () => {
    const calculator = readFileSync("src/lib/dashboard/metrics-calculator.ts", "utf8");
    const metricsCard = readFileSync("src/components/dashboard/AdvancedMetrics.tsx", "utf8");

    expect(calculator).toContain("const growthProjection = revenueChange;");
    expect(calculator).not.toContain("revenueChange * 0.8");
    expect(metricsCard).toContain("Tendencia de Ingresos");
    expect(metricsCard).toContain("no es una predicción");
  });
});
