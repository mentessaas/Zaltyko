import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSuperAdmin } from "@/lib/authz/super-admin";
import { getExperimentalReleaseFlags } from "@/lib/release/experimental-routes";

/**
 * GET /api/admin/analytics
 * Stats globales para Zaltyko super-admin.
 *
 * Devuelve:
 *   - counts: academies, actor_pages, listings, sales, orders, disputes, ratings
 *   - last_30d: ventas y orders en los últimos 30 días
 *   - top_categories: listings por categoría (top 8)
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isSuperAdmin(user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const flags = getExperimentalReleaseFlags();

  const actorPageCount = flags.actorPages
    ? sql`(SELECT COUNT(*) FROM "actor_pages" WHERE "public_visible" = true)::int`
    : sql`0::int`;
  const salesCount = flags.b2bStore
    ? sql`(SELECT COUNT(*) FROM "sales" WHERE "status" = 'paid')::int`
    : sql`0::int`;
  const orderCount = flags.academyMarketplace
    ? sql`(SELECT COUNT(*) FROM "marketplace_orders" WHERE "status" = 'paid')::int`
    : sql`0::int`;
  const disputeCount = flags.academyMarketplace
    ? sql`(SELECT COUNT(*) FROM "marketplace_disputes" WHERE "status" = 'open')::int`
    : sql`0::int`;
  const ratingCount = flags.academyMarketplace
    ? sql`(SELECT COUNT(*) FROM "marketplace_ratings")::int`
    : sql`0::int`;

  // db.execute devuelve Promise<QueryResult<T>>; accedemos a .rows para TS.
  const countsResult = (
    await db.execute<{
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
      ${actorPageCount} AS "actor_pages",
      (SELECT COUNT(*) FROM "marketplace_listings" WHERE "status" = 'active')::int AS "listings",
      ${salesCount} AS "sales",
      ${orderCount} AS "orders",
      ${disputeCount} AS "disputes",
      ${ratingCount} AS "ratings"
  `)
  ).rows as Array<{
    academies: number;
    actor_pages: number;
    listings: number;
    sales: number;
    orders: number;
    disputes: number;
    ratings: number;
  }>;
  const counts = countsResult[0];

  const salesLast30 = flags.b2bStore
    ? sql`(SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN total_cents ELSE 0 END), 0)::int FROM "sales" WHERE created_at >= ${since30})`
    : sql`0::int`;
  const salesCountLast30 = flags.b2bStore
    ? sql`(SELECT COUNT(CASE WHEN status = 'paid' THEN 1 END)::int FROM "sales" WHERE created_at >= ${since30})`
    : sql`0::int`;
  const ordersLast30 = flags.academyMarketplace
    ? sql`(SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN total_cents ELSE 0 END), 0)::int FROM "marketplace_orders" WHERE created_at >= ${since30})`
    : sql`0::int`;
  const ordersCountLast30 = flags.academyMarketplace
    ? sql`(SELECT COUNT(CASE WHEN status = 'paid' THEN 1 END)::int FROM "marketplace_orders" WHERE created_at >= ${since30})`
    : sql`0::int`;

  const last30Result = (
    await db.execute<{
      sales_cents: number;
      orders_cents: number;
      sales_count: number;
      orders_count: number;
    }>(sql`
    SELECT
      ${salesLast30} AS "sales_cents",
      ${ordersLast30} AS "orders_cents",
      ${salesCountLast30} AS "sales_count",
      ${ordersCountLast30} AS "orders_count"
  `)
  ).rows as Array<{
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
