import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createListing,
  listActiveListings,
} from "@/lib/marketplace/service";

/**
 * GET /api/marketplace/listings
 * Lista pública de listings activos del marketplace.
 */
export async function GET() {
  const items = await listActiveListings(100);
  return NextResponse.json(items);
}

/**
 * POST /api/marketplace/listings
 * Body: { sellerAcademyId, title, description?, condition?, priceCents, currency?, quantityAvailable?, imagesUrls?, commissionRatePct?, expiresAt? }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { sellerAcademyId, ...fields } = body ?? {};
  if (
    !sellerAcademyId ||
    typeof sellerAcademyId !== "string" ||
    typeof fields.title !== "string" ||
    typeof fields.priceCents !== "number" ||
    fields.priceCents < 0
  ) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const [ok] = await db
    .select({ id: academies.id })
    .from(academies)
    .innerJoin(sql`profiles`, sql`${academies.ownerId} = ${sql.raw("profiles.id")}`)
    .where(
      sql`${academies.id} = ${sellerAcademyId} AND ${sql.raw("profiles.user_id")} = ${user.id}`
    )
    .limit(1);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [academy] = await db
    .select({ id: academies.id, tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, sellerAcademyId))
    .limit(1);
  if (!academy) return NextResponse.json({ error: "academy_not_found" }, { status: 404 });

  const listing = await createListing({
    tenantId: academy.tenantId,
    sellerAcademyId,
    sourceProductId: fields.sourceProductId ?? null,
    title: fields.title,
    description: fields.description ?? null,
    condition: fields.condition ?? "used",
    priceCents: fields.priceCents,
    currency: fields.currency ?? "EUR",
    quantityAvailable: fields.quantityAvailable ?? 1,
    imagesUrls: fields.imagesUrls ?? [],
    status: "draft", // admin publica después con PATCH
    publishedAt: null,
    expiresAt: fields.expiresAt ? new Date(fields.expiresAt) : null,
    commissionRatePct: fields.commissionRatePct ?? 10,
  });

  return NextResponse.json(listing, { status: 201 });
}
