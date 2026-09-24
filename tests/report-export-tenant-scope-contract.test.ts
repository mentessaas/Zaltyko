import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const attendanceExport = readFileSync("src/app/api/reports/attendance/export/route.ts", "utf8");

describe("report export tenant scope", () => {
  it("does not resolve academy metadata outside the active tenant", () => {
    expect(attendanceExport).toContain("eq(academies.tenantId, context.tenantId)");
  });
});
