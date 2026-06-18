import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { charges } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";

function periodFor(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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
    const currentMonth = periodFor(now);
    const lastMonthLabel = periodFor(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const allCharges = await db
      .select({
        id: charges.id,
        period: charges.period,
        amountCents: charges.amountCents,
        status: charges.status,
      })
      .from(charges)
      .where(and(eq(charges.academyId, academyId), eq(charges.tenantId, context.tenantId)))
      .orderBy(desc(charges.period));

    const paidRevenueForPeriod = (period: string) =>
      allCharges
        .filter((charge) => charge.period === period && charge.status === "paid")
        .reduce((sum, charge) => sum + (charge.amountCents || 0), 0) / 100;

    const currentMonthCharges = allCharges.filter((charge) => charge.period === currentMonth);
    const currentMonthRevenue = paidRevenueForPeriod(currentMonth);
    const previousMonthRevenue = paidRevenueForPeriod(lastMonthLabel);
    const pendingPayments = currentMonthCharges
      .filter((charge) => charge.status !== "paid")
      .reduce((sum, charge) => sum + (charge.amountCents || 0), 0) / 100;

    const lastThreePeriods = [1, 2, 3].map((offset) =>
      periodFor(new Date(now.getFullYear(), now.getMonth() - offset, 1))
    );
    const lastThreeRevenues = lastThreePeriods.map(paidRevenueForPeriod);
    const projectedRevenue =
      lastThreeRevenues.length > 0
        ? Math.round(lastThreeRevenues.reduce((sum, value) => sum + value, 0) / lastThreeRevenues.length)
        : 0;

    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = periodFor(date);
      const revenue = Math.round(paidRevenueForPeriod(monthLabel));

      monthlyTrend.push({
        month: monthLabel,
        revenue,
        expected: revenue,
      });
    }

    const revenueBySource = currentMonthRevenue > 0
      ? [{ source: "Pagos", amount: Math.round(currentMonthRevenue), percentage: 100 }]
      : [];

    return apiSuccess({
      currentMonthRevenue,
      previousMonthRevenue,
      projectedRevenue,
      pendingPayments,
      monthlyTrend,
      revenueBySource,
    });
  } catch (error) {
    logger.error("Error loading revenue trend:", error);
    return apiError("REVENUE_TREND_FAILED", "Error al cargar tendencia de ingresos", 500);
  }
});
