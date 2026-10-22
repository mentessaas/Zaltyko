import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { marketplaceDisputes, marketplaceOrders, academies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSuperAdmin } from "@/lib/authz/super-admin";

/**
 * GET /api/admin/disputes
 * Dashboard de Zaltyko: lista todas las disputas activas con metadata.
 * Solo accesible a super_admin.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isSuperAdmin(user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const conditions = [];
  if (status) conditions.push(eq(marketplaceDisputes.status, status));

  const rows = await db
    .select({
      dispute: marketplaceDisputes,
      order: marketplaceOrders,
      sellerAcademy: { id: academies.id, name: academies.name },
    })
    .from(marketplaceDisputes)
    .innerJoin(marketplaceOrders, eq(marketplaceOrders.id, marketplaceDisputes.orderId))
    .innerJoin(academies, eq(academies.id, marketplaceDisputes.raisedByAcademyId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(marketplaceDisputes.createdAt))
    .limit(100);

  return NextResponse.json(rows);
}
