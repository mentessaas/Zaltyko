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


  it("queries class sessions by their calendar date, not a UTC timestamp", () => {
    const attentionBundle = readFileSync(
      "src/lib/dashboard/attention-bundle.ts",
      "utf8"
    );

    expect(attentionBundle).toContain("eq(classSessions.sessionDate, date)");
    expect(attentionBundle).not.toContain("gte(classSessions.sessionDate, dayStart)");
    expect(attentionBundle).not.toContain("lte(classSessions.sessionDate, dayEnd)");
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
