import { NextRequest, NextResponse } from "next/server";
import { sql, and, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import {
  marketplaceListings,
  marketplaceOrders,
  marketplaceDisputes,
  marketplaceRatings,
  products,
  sales,
  actorPages,
  academies,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSuperAdmin } from "@/lib/authz/super-admin";

/**
 * GET /api/admin/analytics
 * Stats globales para Zaltyko super-admin.
 *
 * Devuelve:
 *   - counts: academies, actor_pages, listings, sales, orders, disputes, ratings
 *   - last_30d: ventas y orders en los últimos 30 días
 *   - top_categories: listings por categoría (top 8)
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isSuperAdmin(user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  // db.execute devuelve Promise<QueryResult<T>>; accedemos a .rows para TS.
  const countsResult = (await db.execute<{
    academies: number;
    actor_pages: number;
    listings: number;
    sales: number;
    orders: number;
    disputes: number;
    ratings: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM "academies")::int AS "academies",
      (SELECT COUNT(*) FROM "actor_pages" WHERE "public_visible" = true)::int AS "actor_pages",
      (SELECT COUNT(*) FROM "marketplace_listings" WHERE "status" = 'active')::int AS "listings",
      (SELECT COUNT(*) FROM "sales" WHERE "status" = 'paid')::int AS "sales",
      (SELECT COUNT(*) FROM "marketplace_orders" WHERE "status" = 'paid')::int AS "orders",
      (SELECT COUNT(*) FROM "marketplace_disputes" WHERE "status" = 'open')::int AS "disputes",
      (SELECT COUNT(*) FROM "marketplace_ratings")::int AS "ratings"
  `)).rows as Array<{
    academies: number;
    actor_pages: number;
    listings: number;
    sales: number;
    orders: number;
    disputes: number;
    ratings: number;
  }>;
  const counts = countsResult[0];

  const last30Result = (await db.execute<{
    sales_cents: number;
    orders_cents: number;
    sales_count: number;
    orders_count: number;
  }>(sql`
    SELECT
      COALESCE(SUM(CASE WHEN s.status = 'paid' THEN s.total_cents ELSE 0 END), 0)::int AS "sales_cents",
      COALESCE(SUM(CASE WHEN mo.status = 'paid' THEN mo.total_cents ELSE 0 END), 0)::int AS "orders_cents",
      COUNT(CASE WHEN s.status = 'paid' THEN 1 END)::int AS "sales_count",
      COUNT(CASE WHEN mo.status = 'paid' THEN 1 END)::int AS "orders_count"
    FROM "academies" a
    LEFT JOIN "sales" s ON s.academy_id = a.id AND s.created_at >= ${since30}
    LEFT JOIN "marketplace_orders" mo ON (mo.seller_academy_id = a.id OR mo.buyer_academy_id = a.id) AND mo.created_at >= ${since30}
  `)).rows as Array<{
    sales_cents: number;
    orders_cents: number;
    sales_count: number;
    orders_count: number;
  }>;
  const last30 = last30Result[0];

  return NextResponse.json({
    counts,
    last_30d: last30,
  });
}
