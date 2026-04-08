import { apiSuccess, apiError } from "@/lib/api-response";
import { eq, and, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { charges, scholarships } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;
  logger.debug("Financial metrics endpoint called - validating cache clear", { academyId });

  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  try {
    // Calcular ingresos del mes actual
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const monthlyRevenueResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)`,
      })
      .from(charges)
      .where(
        and(
          eq(charges.tenantId, context.tenantId),
          eq(charges.academyId, academyId),
          eq(charges.status, "paid"),
          eq(charges.period, currentPeriod)
        )!
      );

    const monthlyRevenue = Number(monthlyRevenueResult[0]?.total || 0) / 100;

    // Calcular pagos pendientes
    const pendingPaymentsResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)`,
        count: sql<number>`COUNT(${charges.id})`,
      })
      .from(charges)
      .where(
        and(
          eq(charges.tenantId, context.tenantId),
          eq(charges.academyId, academyId),
          eq(charges.status, "pending")
        )!
      );

    const pendingPayments = Number(pendingPaymentsResult[0]?.total || 0) / 100;
    const pendingPaymentsCount = Number(pendingPaymentsResult[0]?.count || 0);

    // Calcular becas activas
    const today = new Date().toISOString().split("T")[0];
    const activeScholarshipsResult = await db
      .select({
        count: sql<number>`COUNT(${scholarships.id})`,
      })
      .from(scholarships)
      .where(
        and(
          eq(scholarships.tenantId, context.tenantId),
          eq(scholarships.academyId, academyId),
          eq(scholarships.isActive, true),
          lte(scholarships.startDate, today),
          sql`(${scholarships.endDate} IS NULL OR ${scholarships.endDate} >= ${today})`
        )!
      );

    const activeScholarships = Number(activeScholarshipsResult[0]?.count || 0);

    return apiSuccess({
      monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
      pendingPayments: Math.round(pendingPayments * 100) / 100,
      pendingPaymentsCount,
      activeScholarships,
    });
  } catch (error: any) {
    logger.error("Error calculating financial metrics", error, { academyId });
    return apiError("CALCULATION_FAILED", error.message, 500);
  }
});
