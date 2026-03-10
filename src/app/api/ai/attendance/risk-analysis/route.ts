// src/app/api/ai/attendance/risk-analysis/route.ts
import { sql, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { athletes, attendanceRecords } from "@/db/schema";

// GET /api/ai/attendance/risk-analysis?academyId=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const academyId = searchParams.get("academyId");

    if (!academyId) {
      return NextResponse.json({ error: " academyId is required" }, { status: 400 });
    }

    // Get active athletes
    const athletesList = await db
      .select()
      .from(athletes)
      .where(isNull(athletes.deletedAt));

    const activeAthletes = athletesList.filter((a: any) =>
      a.academyId === academyId && a.status === "active"
    );

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const atRiskAthletes = [];

    for (const athlete of activeAthletes) {
      const attendance = await db
        .select()
        .from(attendanceRecords)
        .where(sql`${attendanceRecords.recordedAt} >= ${thirtyDaysAgo.toISOString()}`);

      const athleteAttendance = attendance.filter((a: any) => a.athleteId === athlete.id);

      const totalClasses = athleteAttendance.length;
      const presentCount = athleteAttendance.filter((a: any) => a.status === "present").length;
      const absentCount = athleteAttendance.filter((a: any) => a.status === "absent").length;

      if (totalClasses === 0) continue;

      const attendanceRate = (presentCount / totalClasses) * 100;
      let riskScore = 0;

      if (attendanceRate < 50) riskScore += 50;
      else if (attendanceRate < 70) riskScore += 30;
      else if (attendanceRate < 85) riskScore += 15;

      if (absentCount >= 5) riskScore += 40;
      else if (absentCount >= 3) riskScore += 25;
      else if (absentCount >= 2) riskScore += 10;

      const sorted = athleteAttendance.sort((a: any, b: any) =>
        new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
      );

      const lastAttendance = sorted[0]?.recordedAt;
      const daysSinceLast = lastAttendance
        ? Math.floor((now.getTime() - new Date(lastAttendance).getTime()) / (24 * 60 * 60 * 1000))
        : 999;

      if (daysSinceLast > 14) riskScore += 30;
      else if (daysSinceLast > 7) riskScore += 15;
      else if (daysSinceLast > 3) riskScore += 5;

      riskScore = Math.min(100, riskScore);

      if (riskScore >= 20) {
        const riskLevel: "high" | "medium" | "low" = riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low";

        atRiskAthletes.push({
          athleteId: athlete.id,
          athleteName: athlete.name,
          athleteStatus: athlete.status,
          totalClasses,
          presentCount,
          absentCount,
          attendanceRate: Math.round(attendanceRate),
          lastAttendance,
          daysSinceLastAttendance: daysSinceLast,
          riskScore,
          riskLevel,
        });
      }
    }

    atRiskAthletes.sort((a: any, b: any) => b.riskScore - a.riskScore);

    return NextResponse.json({
      athletes: atRiskAthletes.slice(0, 10),
      totalCount: atRiskAthletes.length,
      summary: {
        highRisk: atRiskAthletes.filter((a: any) => a.riskLevel === "high").length,
        mediumRisk: atRiskAthletes.filter((a: any) => a.riskLevel === "medium").length,
        lowRisk: atRiskAthletes.filter((a: any) => a.riskLevel === "low").length,
        avgAttendance: atRiskAthletes.length > 0
          ? Math.round(atRiskAthletes.reduce((sum: number, a: any) => sum + a.attendanceRate, 0) / atRiskAthletes.length)
          : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching attendance risk analysis:", error);
    return NextResponse.json({ error: "Failed to fetch attendance risk analysis" }, { status: 500 });
  }
}
