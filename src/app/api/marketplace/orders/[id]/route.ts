import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { marketplaceOrders, profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * GET /api/marketplace/orders/[id]
 * Seller o buyer del order pueden verlo.
 *
 * Resuelve access control comparando el user.id con el owner de la academia del order
 * (seller o buyer).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [order] = await db
    .select()
    .from(marketplaceOrders)
    .where(eq(marketplaceOrders.id, id))
    .limit(1);
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Buscar profiles cuyo activeAcademyId sea el sellerAcademyId o buyerAcademyId,
  // y que su userId coincida con el del request.
  const [access] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.userId, user.id),
        sql`${profiles.activeAcademyId} IN (${order.sellerAcademyId}, ${order.buyerAcademyId})`,
      ),
    )
    .limit(1);

  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(order);
}

/**
 * POST /api/marketplace/orders/[id]
 *
 * DEPRECATED — refactor pendiente.
 *
 * La firma anterior (handler con 4 args: req, ctx, body) era incorrecta en Next.js 15 App Router
 * y dependía de helpers (`createPendingOrder`, `getOrder`, `getStripeClient`) que referencian
 * columnas inexistentes (`academies.stripeAccountId`). Hasta que se migre el schema y los
 * helpers de Stripe Connect, devolvemos 410 Gone para no exponer código roto.
 */
export async function POST() {
  return NextResponse.json(
    { error: "endpoint_under_refactor", detail: "POST /api/marketplace/orders/[id] pendiente de migración a Stripe Connect + schema real." },
    { status: 410 }
  );
}