import { eq, and, desc } from "drizzle-orm";
import { withTenant } from "@/lib/authz";

import { db } from "@/db";
import { receipts, athletes } from "@/db/schema";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");
  const athleteId = url.searchParams.get("athleteId");

  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "academyId requerido", 400);
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
      metadata: receipts.metadata,
      createdAt: receipts.createdAt,
    })
    .from(receipts)
    .innerJoin(athletes, eq(receipts.athleteId, athletes.id))
    .where(and(...whereConditions))
    .orderBy(desc(receipts.createdAt));

  return apiSuccess({
    items: items.map((item) => {
      const metadata = item.metadata || {};
      return {
        ...item,
        amount: Number(item.amount) / 100,
        items: (metadata.items as Array<{ description: string; amount: number }>) || [],
        period: (metadata.period as string) || "N/A",
      };
    }),
  });
});
