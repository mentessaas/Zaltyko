// Simplified churn report - returns mock data for now
// In production, implement proper queries based on actual schema

import { db } from "@/db";
import { athletes } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export interface ChurnReportFilters {
  academyId: string;
  tenantId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface ChurnReason {
  reason: string;
  count: number;
  percentage: number;
}

export interface ChurnedAthlete {
  athleteId: string;
  athleteName: string;
  churnDate: string;
  reason: string;
  membershipEndDate: string;
  monthsActive: number;
}

export interface ChurnStats {
  totalChurned: number;
  churnRate: number;
  voluntaryChurn: number;
  involuntaryChurn: number;
  reasons: ChurnReason[];
  recentChurns: ChurnedAthlete[];
}

export async function calculateChurnReport(filters: ChurnReportFilters): Promise<ChurnStats> {
  // Get churned athletes
  const churnedAthletes = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      status: athletes.status,
      createdAt: athletes.createdAt,
    })
    .from(athletes)
    .where(eq(athletes.academyId, filters.academyId));

  const churned = churnedAthletes.filter((a) => a.status === "churned");
  const totalAthletes = churnedAthletes.length;
  const totalChurned = churned.length;
  const churnRate = totalAthletes > 0 ? (totalChurned / totalAthletes) * 100 : 0;

  // Default reasons
  const reasons: ChurnReason[] = [
    { reason: "financial", count: Math.floor(totalChurned * 0.3), percentage: 30 },
    { reason: "relocation", count: Math.floor(totalChurned * 0.2), percentage: 20 },
    { reason: "dissatisfaction", count: Math.floor(totalChurned * 0.15), percentage: 15 },
    { reason: "other", count: totalChurned - Math.floor(totalChurned * 0.65), percentage: 35 },
  ].filter((r) => r.count > 0);

  // Recent churns
  const recentChurns: ChurnedAthlete[] = churned.slice(0, 10).map((athlete) => ({
    athleteId: athlete.id,
    athleteName: athlete.name || "Sin nombre",
    churnDate: new Date().toISOString().split("T")[0],
    reason: "other",
    membershipEndDate: "",
    monthsActive: 1,
  }));

  return {
    totalChurned,
    churnRate: Math.round(churnRate * 10) / 10,
    voluntaryChurn: Math.floor(totalChurned * 0.7),
    involuntaryChurn: Math.floor(totalChurned * 0.3),
    reasons,
    recentChurns,
  };
}
