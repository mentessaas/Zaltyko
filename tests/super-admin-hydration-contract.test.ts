import { describe, expect, it } from "vitest";

import {
  formatSuperAdminDate,
  formatSuperAdminDateTime,
  formatSuperAdminLongDate,
  formatSuperAdminMonth,
} from "@/lib/super-admin-date";

describe("super-admin dashboard hydration contract", () => {
  it("formats server-rendered dates deterministically in UTC", () => {
    const timestamp = "2026-09-13T00:30:00.000Z";
    expect(formatSuperAdminDate(timestamp)).toBe("13/9/2026");
    expect(formatSuperAdminLongDate(timestamp)).toBe("13 de septiembre de 2026");
    expect(formatSuperAdminDateTime(timestamp)).toBe("13 sept, 00:30");
  });

  it("keeps monthly chart labels stable and rejects invalid values", () => {
    expect(formatSuperAdminMonth("2026-09")).toBe("sept 26");
    expect(formatSuperAdminMonth("invalid")).toBe("invalid");
    expect(formatSuperAdminDate("not-a-date")).toBeNull();
  });
});
