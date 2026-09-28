import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, marketplaceOrders, profiles } from "@/db/schema";
import { marketplaceDisputes } from "@/db/schema/trust";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveDispute } from "@/lib/trust/service";

/** Resolve an order dispute from the buyer or seller side. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  if (
    typeof body.notes !== "string" ||
    (body.resolvedBy !== "buyer" && body.resolvedBy !== "seller")
  ) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const [dispute] = await db
    .select({
      raisedByAcademyId: marketplaceDisputes.raisedByAcademyId,
      status: marketplaceDisputes.status,
      buyerAcademyId: marketplaceOrders.buyerAcademyId,
      sellerAcademyId: marketplaceOrders.sellerAcademyId,
    })
    .from(marketplaceDisputes)
    .innerJoin(marketplaceOrders, eq(marketplaceDisputes.orderId, marketplaceOrders.id))
    .where(eq(marketplaceDisputes.id, id))
    .limit(1);
  if (!dispute) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (dispute.status !== "open") {
    return NextResponse.json({ error: "already_resolved" }, { status: 409 });
  }
  const resolverAcademyId = body.resolvedBy === "buyer"
    ? dispute.buyerAcademyId
    : dispute.sellerAcademyId;
  if (!resolverAcademyId || resolverAcademyId === dispute.raisedByAcademyId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const [owner] = await db
    .select({ id: academies.id })
    .from(academies)
    .innerJoin(profiles, eq(academies.ownerId, profiles.id))
    .where(and(eq(academies.id, resolverAcademyId), eq(profiles.userId, user.id)))
    .limit(1);
  if (!owner) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    await resolveDispute({ disputeId: id, resolvedBy: body.resolvedBy, notes: body.notes });
  } catch (error) {
    if (error instanceof Error && error.message === "DISPUTE_NOT_OPEN") {
      return NextResponse.json({ error: "already_resolved" }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}
