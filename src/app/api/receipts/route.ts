import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { withTenant } from "@/lib/authz";

import { db } from "@/db";
import { receipts, athletes } from "@/db/schema";

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");
  const athleteId = url.searchParams.get("athleteId");

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  const whereConditions = [
    eq(receipts.academyId, academyId),
    eq(receipts.tenantId, context.tenantId),
  ];

  if (athleteId) {
    whereConditions.push(eq(receipts.athleteId, athleteId));
  }

  const items = await db
    .select({
      id: receipts.id,
      athleteId: receipts.athleteId,
      athleteName: athletes.name,
      amount: receipts.amount,
      currency: receipts.currency,
      period: receipts.period,
      items: receipts.items,
      createdAt: receipts.createdAt,
    })
    .from(receipts)
    .innerJoin(athletes, eq(receipts.athleteId, athletes.id))
    .where(and(...whereConditions))
    .orderBy(desc(receipts.createdAt));

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      amount: Number(item.amount) / 100,
      items: item.items || [],
    })),
  });
});

