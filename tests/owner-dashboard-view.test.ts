import { describe, expect, it } from "vitest";

import { formatDate, formatMetric } from "@/components/owner-dashboard/OwnerDashboardView";

describe("formato de fechas del dashboard Owner", () => {
  const metric = { key: "paid", name: "Cobros", unit: "currency_minor", value: 1900, currency: null, numerator: null, denominator: null, coverage: 1, quality: "complete", formulaVersion: 1, normalizedScore: null, target: null, weight: null, sourceWatermark: "2026-11-04T00:00:00Z" };
  it("no inventa euros para un valor sin moneda y distingue EUR de MXN", () => {
    expect(formatMetric(metric)).toBe("Moneda no disponible");
    expect(formatMetric({ ...metric, currency: "MXN" })).toContain("MXN");
    expect(formatMetric({ ...metric, currency: "MXN" })).not.toContain("EUR");
    expect(formatMetric({ ...metric, currency: "EUR" })).toContain("EUR");
  });
  it("mantiene el día civil del período en una zona que adelanta al día siguiente", () => {
    const originalTimeZone = process.env.TZ;

    try {
      process.env.TZ = "Pacific/Kiritimati";
      expect(formatDate("2026-10-23")).toBe("23 oct 2026");
    } finally {
      if (originalTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimeZone;
      }
    }
  });
});
