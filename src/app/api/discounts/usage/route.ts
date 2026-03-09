import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { withTenant } from "@/lib/authz";

import { db } from "@/db";
import { discountUsageHistory, discounts, athletes } from "@/db/schema";

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");
  const discountId = url.searchParams.get("discountId");
  const athleteId = url.searchParams.get("athleteId");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  const conditions = [
    eq(discountUsageHistory.academyId, academyId),
    eq(discountUsageHistory.tenantId, context.tenantId),
  ];

  if (discountId) {
    conditions.push(eq(discountUsageHistory.discountId, discountId));
  }

  if (athleteId) {
    conditions.push(eq(discountUsageHistory.athleteId, athleteId));
  }

  const items = await db
    .select({
      id: discountUsageHistory.id,
      discountId: discountUsageHistory.discountId,
      discountName: discounts.name,
      discountCode: discountUsageHistory.code,
      athleteId: discountUsageHistory.athleteId,
      athleteName: athletes.name,
      chargeId: discountUsageHistory.chargeId,
      discountAmount: discountUsageHistory.discountAmount,
      originalAmount: discountUsageHistory.originalAmount,
      finalAmount: discountUsageHistory.finalAmount,
      usedAt: discountUsageHistory.usedAt,
    })
    .from(discountUsageHistory)
    .leftJoin(discounts, eq(discountUsageHistory.discountId, discounts.id))
    .leftJoin(athletes, eq(discountUsageHistory.athleteId, athletes.id))
    .where(and(...conditions))
    .orderBy(desc(discountUsageHistory.usedAt))
    .limit(limit);

  // Calculate totals
  const totals = await db
    .select({
      totalDiscount: discountUsageHistory.discountAmount,
    })
    .from(discountUsageHistory)
    .where(and(...conditions));

  const totalDiscount = totals.reduce(
    (sum, item) => sum + Number(item.totalDiscount),
    0
  );

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      discountAmount: Number(item.discountAmount),
      originalAmount: Number(item.originalAmount),
      finalAmount: Number(item.finalAmount),
    })),
    summary: {
      totalUsage: items.length,
      totalDiscount,
    },
  });
});
