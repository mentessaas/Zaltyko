import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync(
  "src/app/api/ai/attendance/predict-absence/route.ts",
  "utf8",
);
const dataHelper = readFileSync("src/lib/ai/attendance-data.ts", "utf8");
const riskRoute = readFileSync("src/app/api/ai/attendance/analyze-risk/route.ts", "utf8");
const progressRoute = readFileSync("src/app/api/ai/communication/generate-progress-update/route.ts", "utf8");
const delinquencyRoute = readFileSync("src/app/api/ai/billing/predict-delinquency/route.ts", "utf8");
const reminderRoute = readFileSync("src/app/api/ai/billing/generate-reminder/route.ts", "utf8");
const permissions = readFileSync("src/lib/authz/route-permissions.ts", "utf8");

describe("attendance prediction contract", () => {
  it("reads attendance from the scoped server query instead of an internal route", () => {
    expect(dataHelper).toContain("attendanceRecords");
    expect(dataHelper).toContain("eq(attendanceRecords.tenantId, tenantId)");
    expect(dataHelper).toContain("eq(attendanceRecords.athleteId, athleteId)");
    expect(dataHelper).toContain("eq(classes.academyId, academyId)");
    expect(route).not.toContain("/api/attendance/records");
    expect(route).not.toContain("fetch(");
  });

  it("validates the UUID query, athlete scope and provider budget", () => {
    expect(route).toContain("querySchema.safeParse");
    expect(dataHelper).toContain("verifyCoachAthleteScope");
    expect(route).toContain("limit: 15");
    expect(route).toContain("maxTokens: 256");
    expect(route).toContain("insufficientData: relevantRecords.length < 5");
    expect(route).toContain('name: "la gimnasta"');
    expect(riskRoute).toContain("bodySchema");
    expect(riskRoute).toContain("getScopedAttendanceSnapshot");
    expect(riskRoute).toContain("insufficientData");
  });

  it("requires athlete read capability for all attendance AI endpoints", () => {
    expect(permissions).toContain('prefix: "/api/ai/attendance"');
    expect(permissions).toContain('permissions: { GET: "athletes:read", POST: "athletes:read" }');
  });

  it("does not trust client-provided names, payment history or charge amounts", () => {
    expect(progressRoute).toContain("getScopedAttendanceSnapshot");
    expect(progressRoute).toContain("recentAssessments");
    expect(progressRoute).toContain("max(20)");
    expect(delinquencyRoute).toContain("getScopedAthlete");
    expect(delinquencyRoute).toContain("from(charges)");
    expect(delinquencyRoute).toContain("eq(charges.tenantId, context.tenantId)");
    expect(reminderRoute).toContain("CHARGE_NOT_FOUND");
    expect(reminderRoute).toContain("inArray(charges.status, REMINDER_STATUSES)");
    expect(reminderRoute).toContain('name: "la familia"');
  });
});
