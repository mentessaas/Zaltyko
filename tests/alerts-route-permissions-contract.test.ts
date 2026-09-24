import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getRequiredRoutePermission } from "@/lib/authz/route-permissions";

const capacityRoute = readFileSync("src/app/api/alerts/capacity/route.ts", "utf8");
const paymentsRoute = readFileSync("src/app/api/alerts/payments/route.ts", "utf8");
const attendanceRoute = readFileSync("src/app/api/alerts/attendance/route.ts", "utf8");
const classRemindersRoute = readFileSync("src/app/api/alerts/class-reminders/route.ts", "utf8");

describe("dashboard alert route permissions", () => {
  it("does not expose operational or financial alerts to any tenant member", () => {
    expect(getRequiredRoutePermission("/api/alerts/capacity", "GET")).toBe("classes:read");
    expect(getRequiredRoutePermission("/api/alerts/attendance", "GET")).toBe("classes:read");
    expect(getRequiredRoutePermission("/api/alerts/payments", "GET")).toBe("billing:read");
    expect(getRequiredRoutePermission("/api/alerts/class-reminders", "POST")).toBe("communications:send");
    expect(getRequiredRoutePermission("/api/alerts/class-reminders", "GET")).toBeNull();
    expect(getRequiredRoutePermission("/api/reports/class/email", "POST")).toBe("communications:send");
    expect(getRequiredRoutePermission("/api/reports/class/export", "GET")).toBe("reports:export");
  });

  it("rechaza umbrales y ventanas fuera de rango con un contrato 400", () => {
    expect(capacityRoute).toContain("z.coerce.number().finite().min(0).max(100)");
    expect(paymentsRoute).toContain("z.coerce.number().int().min(0).max(3650)");
    expect(attendanceRoute).toContain("z.coerce.number().int().min(1).max(3660)");
    expect(capacityRoute).toContain('apiError("INVALID_QUERY"');
    expect(capacityRoute).toContain('"CAPACITY_ALERTS_FAILED"');
    expect(paymentsRoute).toContain('apiError("INVALID_QUERY"');
    expect(paymentsRoute).toContain('"PAYMENT_ALERTS_FAILED"');
    expect(attendanceRoute).toContain('apiError("INVALID_QUERY"');
    expect(attendanceRoute).toContain('"ATTENDANCE_ALERTS_FAILED"');
  });

  it("valida el endpoint manual de recordatorios antes de ejecutar envíos", () => {
    expect(classRemindersRoute).toContain("querySchema.safeParse");
    expect(classRemindersRoute).toContain('apiError("INVALID_QUERY"');
    expect(classRemindersRoute).toContain("validated.data.academyId");
  });
});
