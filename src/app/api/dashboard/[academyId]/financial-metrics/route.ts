import { NextResponse } from "next/server";
import { eq, and, gte, lte, sql, count } from "drizzle-orm";

import { db } from "@/db";
import { charges, scholarships } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const academyId = (context.params as { academyId?: string } | undefined)?.academyId;
  logger.debug("Financial metrics endpoint called - validating cache clear", { academyId });

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  logger.debug("Financial metrics endpoint called - validating cache clear", { academyId });

  try {
    // Calcular ingresos del mes actual
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
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
        )
      );

    const monthlyRevenue = Number(monthlyRevenueResult[0]?.total || 0) / 100;

    // Calcular pagos pendientes
    const pendingPaymentsResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)`,
        count: count(charges.id),
      })
      .from(charges)
      .where(
        and(
          eq(charges.tenantId, context.tenantId),
          eq(charges.academyId, academyId),
          eq(charges.status, "pending")
        )
      );

    const pendingPayments = Number(pendingPaymentsResult[0]?.total || 0) / 100;
    const pendingPaymentsCount = Number(pendingPaymentsResult[0]?.count || 0);

    // Calcular becas activas
    const today = new Date().toISOString().split("T")[0];
    const activeScholarshipsResult = await db
      .select({
        count: count(scholarships.id),
      })
      .from(scholarships)
      .where(
        and(
          eq(scholarships.tenantId, context.tenantId),
          eq(scholarships.academyId, academyId),
          eq(scholarships.isActive, true),
          lte(scholarships.startDate, today),
          sql`(${scholarships.endDate} IS NULL OR ${scholarships.endDate} >= ${today})`
        )
      );

    const activeScholarships = Number(activeScholarshipsResult[0]?.count || 0);

    return NextResponse.json({
      monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
      pendingPayments: Math.round(pendingPayments * 100) / 100,
      pendingPaymentsCount,
      activeScholarships,
    });
  } catch (error: any) {
    logger.error("Error calculating financial metrics", error, { academyId });
    return NextResponse.json(
      { error: "CALCULATION_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

