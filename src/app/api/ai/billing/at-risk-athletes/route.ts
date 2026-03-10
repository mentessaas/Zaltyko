// src/app/api/ai/billing/at-risk-athletes/route.ts
import { sql, isNull, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { athletes, charges } from "@/db/schema";

// GET /api/ai/billing/at-risk-athletes?academyId=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const academyId = searchParams.get("academyId");

    if (!academyId) {
      return NextResponse.json({ error: " academyId is required" }, { status: 400 });
    }

    const now = new Date();

    // Get pending/overdue charges
    const pendingCharges = await db
      .select()
      .from(charges)
      .where(
        or(
          sql`${charges.status} = 'pending'`,
          sql`${charges.status} = 'overdue'`
        )
      );

    // Get athletes
    const athleteDetails = await db
      .select()
      .from(athletes)
      .where(isNull(athletes.deletedAt));

    const athleteMap = new Map();

    for (const charge of pendingCharges as any[]) {
      const athlete = athleteDetails.find((a: any) =>
        a.id === charge.athleteId && a.academyId === academyId
      );

      if (!athlete) continue;

      if (!athleteMap.has(athlete.id)) {
        athleteMap.set(athlete.id, {
          id: athlete.id,
          name: athlete.name,
          dob: athlete.dob,
          status: athlete.status,
          charges: [],
          totalPending: 0,
          oldestPendingDays: 0
        });
      }

      const entry = athleteMap.get(athlete.id);
      entry.charges.push(charge);
      entry.totalPending += charge.amountCents || 0;

      const daysSinceCreated = Math.floor(
        (now.getTime() - new Date(charge.createdAt).getTime()) / (24 * 60 * 60 * 1000)
      );
      if (entry.oldestPendingDays === 0 || daysSinceCreated > entry.oldestPendingDays) {
        entry.oldestPendingDays = daysSinceCreated;
      }
    }

    const atRiskAthletes = Array.from(athleteMap.values())
      .map((athlete: any) => {
        let riskScore = 0;

        if (athlete.totalPending > 10000) riskScore += 30;
        else if (athlete.totalPending > 5000) riskScore += 20;
        else if (athlete.totalPending > 2000) riskScore += 10;

        if (athlete.oldestPendingDays > 60) riskScore += 40;
        else if (athlete.oldestPendingDays > 30) riskScore += 30;
        else if (athlete.oldestPendingDays > 14) riskScore += 20;
        else if (athlete.oldestPendingDays > 7) riskScore += 10;

        if (athlete.charges.length >= 3) riskScore += 30;
        else if (athlete.charges.length >= 2) riskScore += 20;

        riskScore = Math.min(100, riskScore);

        const riskLevel: "high" | "medium" | "low" = riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low";

        return {
          athleteId: athlete.id,
          athleteName: athlete.name,
          athleteDob: athlete.dob,
          athleteStatus: athlete.status,
          parentName: null,
          parentEmail: null,
          pendingCharges: athlete.charges.map((c: any) => ({
            id: c.id,
            amount: c.amountCents,
            period: c.period,
            dueDate: c.dueDate,
            status: c.status,
            createdAt: c.createdAt,
          })),
          totalPending: athlete.totalPending,
          oldestPendingDays: athlete.oldestPendingDays,
          riskScore,
          riskLevel,
          totalPendingFormatted: `€${(athlete.totalPending / 100).toFixed(2)}`,
        };
      })
      .sort((a: any, b: any) => b.riskScore - a.riskScore)
      .slice(0, 10);

    return NextResponse.json({
      athletes: atRiskAthletes,
      totalCount: atRiskAthletes.length,
      summary: {
        highRisk: atRiskAthletes.filter((a: any) => a.riskLevel === "high").length,
        mediumRisk: atRiskAthletes.filter((a: any) => a.riskLevel === "medium").length,
        lowRisk: atRiskAthletes.filter((a: any) => a.riskLevel === "low").length,
        totalPending: atRiskAthletes.reduce((sum: number, a: any) => sum + a.totalPending, 0),
      },
    });
  } catch (error) {
    console.error("Error fetching at-risk athletes:", error);
    return NextResponse.json({ error: "Failed to fetch at-risk athletes" }, { status: 500 });
  }
}
