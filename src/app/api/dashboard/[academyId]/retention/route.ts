import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { athletes } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isActiveAt(row: { status: string; createdAt: Date | null; deletedAt: Date | null }, monthEnd: Date) {
  if (!row.createdAt || row.createdAt >= monthEnd) return false;
  if (row.deletedAt && row.deletedAt < monthEnd) return false;
  return row.status === "active";
}

export const GET = withTenant(async (_request, context) => {
  const academyId = (context.params as { academyId?: string } | undefined)?.academyId;

  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  try {
    const access = await verifyAcademyAccessForProfile({
      academyId,
      tenantId: context.tenantId,
      profile: context.profile,
    });
    if (!access.allowed) {
      return apiError(access.reason ?? "FORBIDDEN", "Access denied", 403);
    }

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const allAthletes = await db
      .select({
        id: athletes.id,
        status: athletes.status,
        createdAt: athletes.createdAt,
        deletedAt: athletes.deletedAt,
      })
      .from(athletes)
      .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, context.tenantId)));

    const totalAthletes = allAthletes.filter((athlete) => !athlete.deletedAt).length;
    const activeAthletes = allAthletes.filter((athlete) => !athlete.deletedAt && athlete.status === "active").length;
    const newAthletesThisMonth = allAthletes.filter((athlete) => {
      if (!athlete.createdAt) return false;
      return athlete.createdAt >= currentMonthStart && athlete.createdAt < currentMonthEnd;
    }).length;
    const churnedAthletesThisMonth = allAthletes.filter((athlete) => {
      if (!athlete.deletedAt) return false;
      return athlete.deletedAt >= currentMonthStart && athlete.deletedAt < currentMonthEnd;
    }).length;

    const retentionRate = totalAthletes > 0 ? (activeAthletes / totalAthletes) * 100 : 0;
    const previousMonthEnd = currentMonthStart;
    const previousMonthTotal = allAthletes.filter((athlete) => athlete.createdAt && athlete.createdAt < previousMonthEnd).length;
    const previousMonthActive = allAthletes.filter((athlete) => isActiveAt(athlete, previousMonthEnd)).length;
    const previousRetentionRate = previousMonthTotal > 0
      ? (previousMonthActive / previousMonthTotal) * 100
      : retentionRate;

    const monthlyData = [];
    for (let offset = 5; offset >= 0; offset--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
      const active = allAthletes.filter((athlete) => isActiveAt(athlete, monthEnd)).length;
      const newCount = allAthletes.filter((athlete) => {
        if (!athlete.createdAt) return false;
        return athlete.createdAt >= monthStart && athlete.createdAt < monthEnd;
      }).length;
      const churned = allAthletes.filter((athlete) => {
        if (!athlete.deletedAt) return false;
        return athlete.deletedAt >= monthStart && athlete.deletedAt < monthEnd;
      }).length;

      monthlyData.push({
        month: monthKey(monthStart),
        active,
        churned,
        new: newCount,
      });
    }

    return apiSuccess({
      totalAthletes,
      activeAthletes,
      newAthletesThisMonth,
      churnedAthletesThisMonth,
      retentionRate,
      previousRetentionRate,
      monthlyData,
    });
  } catch (error) {
    logger.error("Error loading retention data:", error);
    return apiError("RETENTION_FAILED", "Error al cargar datos de retencion", 500);
  }
});
