import { eq, and, desc } from "drizzle-orm";
import { withTenant } from "@/lib/authz";

import { db } from "@/db";
import { receipts, athletes } from "@/db/schema";
import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";

export const dynamic = 'force-dynamic';

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");
  const athleteId = url.searchParams.get("athleteId");

  const parsedIds = z.object({ academyId: z.string().uuid(), athleteId: z.string().uuid().optional() }).safeParse({
    academyId,
    athleteId: athleteId || undefined,
  });
  if (!parsedIds.success) {
    return apiError("ACADEMY_ID_REQUIRED", "academyId requerido", 400);
  }

  const whereConditions = [
    eq(receipts.academyId, parsedIds.data.academyId),
    eq(receipts.tenantId, context.tenantId),
  ];

  if (parsedIds.data.athleteId) {
    whereConditions.push(eq(receipts.athleteId, parsedIds.data.athleteId));
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
    .leftJoin(athletes, eq(receipts.athleteId, athletes.id))
    .where(and(...whereConditions))
    .orderBy(desc(receipts.createdAt))
    .limit(500);

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
