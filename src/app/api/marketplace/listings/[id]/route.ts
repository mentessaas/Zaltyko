import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getListing,
  updateListing,
  withdrawListing,
} from "@/lib/marketplace/service";

async function assertSeller(listingId: string, userId: string) {
  const [ok] = await db
    .select({ id: academies.id })
    .from(academies)
    .innerJoin(sql`profiles`, sql`${academies.ownerId} = ${sql.raw("profiles.id")}`)
    .where(
      sql`${academies.id} = (SELECT seller_academy_id FROM marketplace_listings WHERE id = ${listingId}) AND ${sql.raw("profiles.user_id")} = ${userId}`
    )
    .limit(1);
  return ok;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(listing);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await assertSeller(params.id, user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if ("title" in body) patch.title = body.title;
  if ("description" in body) patch.description = body.description;
  if ("condition" in body) patch.condition = body.condition;
  if ("priceCents" in body) patch.priceCents = body.priceCents;
  if ("currency" in body) patch.currency = body.currency;
  if ("quantityAvailable" in body) patch.quantityAvailable = body.quantityAvailable;
  if ("imagesUrls" in body) patch.imagesUrls = body.imagesUrls;
  if ("categoryId" in body) patch.categoryId = body.categoryId;
  if ("expiresAt" in body) patch.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if ("status" in body) {
    patch.status = body.status;
    if (body.status === "active" && !("publishedAt" in body)) {
      patch.publishedAt = new Date();
    }
    if (body.status === "withdrawn") {
      patch.status = "withdrawn";
    }
  }
  const updated = await updateListing(params.id, patch);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await assertSeller(params.id, user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await withdrawListing(params.id);
  return NextResponse.json({ ok: true });
}
