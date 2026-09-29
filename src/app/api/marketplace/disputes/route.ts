import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  openDispute,
  getDisputeForOrder,
} from "@/lib/trust/service";

/**
 * GET /api/marketplace/disputes?orderId=...
 * Devuelve la disputa activa de una orden (si existe).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "missing_orderId" }, { status: 400 });
  }
  const dispute = await getDisputeForOrder(orderId);
  return NextResponse.json(dispute);
}

/**
 * POST /api/marketplace/disputes
 * Body: { orderId, reason, description }
 * Abre una disputa como buyer o seller.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { orderId, reason, description } = body ?? {};
  if (!orderId || typeof orderId !== "string" || typeof description !== "string" || typeof reason !== "string") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Determinar la academia del user
  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .innerJoin(sql`profiles`, sql`${academies.ownerId} = ${sql.raw("profiles.id")}`)
    .where(sql`${sql.raw("profiles.user_id")} = ${user.id}`)
    .limit(1);
  if (!academy) return NextResponse.json({ error: "no_academy" }, { status: 403 });

  try {
    const dispute = await openDispute({
      orderId,
      raisedByAcademyId: academy.id,
      reason: reason as "not_received" | "damaged" | "not_as_described" | "wrong_item" | "other",
      description,
    });
    return NextResponse.json(dispute, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: "open_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 400 }
    );
  }
}
