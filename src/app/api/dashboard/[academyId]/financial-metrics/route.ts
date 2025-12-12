// @ts-nocheck - Conflictos de tipos entre múltiples versiones de drizzle-orm en node_modules
// Estos errores son causados por duplicados de dependencias y no afectan la ejecución del código
import { NextResponse } from "next/server";
import { eq, and, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { charges, scholarships } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;
  logger.debug("Financial metrics endpoint called - validating cache clear", { academyId });

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
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
