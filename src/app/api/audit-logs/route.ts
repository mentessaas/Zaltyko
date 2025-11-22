import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, gte, lte, ilike, or, desc } from "drizzle-orm";
import { withTenant } from "@/lib/authz";

import { db } from "@/db";
import { auditLogs, profiles } from "@/db/schema";

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
  q: z.string().optional(),
  action: z.string().optional(),
  table: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    q: url.searchParams.get("q"),
    action: url.searchParams.get("action"),
    table: url.searchParams.get("table"),
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
    limit: url.searchParams.get("limit"),
  };

  const validated = querySchema.parse(params);

  const whereConditions = [eq(auditLogs.tenantId, context.tenantId)];

  if (validated.academyId) {
    whereConditions.push(eq(auditLogs.academyId, validated.academyId));
  }
  if (validated.action) {
    whereConditions.push(eq(auditLogs.action, validated.action));
  }
  if (validated.table) {
    whereConditions.push(eq(auditLogs.tableName, validated.table));
  }
  if (validated.startDate) {
    whereConditions.push(gte(auditLogs.createdAt, new Date(validated.startDate)));
  }
  if (validated.endDate) {
    whereConditions.push(lte(auditLogs.createdAt, new Date(validated.endDate)));
  }

  const limit = validated.limit ? parseInt(validated.limit) : 100;

  const items = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      tableName: auditLogs.tableName,
      recordId: auditLogs.recordId,
      userId: auditLogs.userId,
      userName: profiles.name,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(profiles, eq(auditLogs.userId, profiles.id))
    .where(and(...whereConditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  // Filtrar por búsqueda de texto si existe
  let filteredItems = items;
  if (validated.q) {
    const query = validated.q.toLowerCase();
    filteredItems = items.filter(
      (item) =>
        item.action.toLowerCase().includes(query) ||
        item.tableName.toLowerCase().includes(query) ||
        (item.userName && item.userName.toLowerCase().includes(query)) ||
        item.recordId.toLowerCase().includes(query)
    );
  }

  return NextResponse.json({
    items: filteredItems.map((item) => ({
      id: item.id,
      action: item.action,
      tableName: item.tableName,
      recordId: item.recordId,
      userId: item.userId,
      userName: item.userName || "Desconocido",
      metadata: item.metadata,
      createdAt: item.createdAt?.toISOString(),
    })),
  });
});

