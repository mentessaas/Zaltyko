import { describe, expect, it } from "vitest";

import { formatDate } from "@/components/owner-dashboard/OwnerDashboardView";

describe("formato de fechas del dashboard Owner", () => {
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
