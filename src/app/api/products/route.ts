import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createProduct,
  listProductsByAcademy,
} from "@/lib/store/service";

/**
 * GET /api/products?academyId=...
 * Lista productos del academy (owner only).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const academyId = url.searchParams.get("academyId");
  if (!academyId) {
    return NextResponse.json({ error: "missing_academyId" }, { status: 400 });
  }

  // Permiso: el user debe ser owner del academy.
  const [ok] = await db
    .select({ id: academies.id })
    .from(academies)
    .innerJoin(sql`profiles`, sql`${academies.ownerId} = ${sql.raw("profiles.id")}`)
    .where(
      sql`${academies.id} = ${academyId} AND ${sql.raw("profiles.user_id")} = ${user.id}`
    )
    .limit(1);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const items = await listProductsByAcademy(academyId);
  return NextResponse.json(items);
}

/**
 * POST /api/products
 * Body: { academyId, sku?, name, description?, productType?, priceCents, currency?, isActive?, isFeatured?, stockQuantity?, lowStockThreshold?, imageUrls?, metadata?, visibility? }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { academyId, ...fields } = body ?? {};
  if (!academyId || typeof academyId !== "string" || !fields.name || typeof fields.name !== "string") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (typeof fields.priceCents !== "number" || fields.priceCents < 0) {
    return NextResponse.json({ error: "invalid_price" }, { status: 400 });
  }

  // Permiso
  const [ok] = await db
    .select({ id: academies.id })
    .from(academies)
    .innerJoin(sql`profiles`, sql`${academies.ownerId} = ${sql.raw("profiles.id")}`)
    .where(
      sql`${academies.id} = ${academyId} AND ${sql.raw("profiles.user_id")} = ${user.id}`
    )
    .limit(1);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [academy] = await db
    .select({ id: academies.id, tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  if (!academy) return NextResponse.json({ error: "academy_not_found" }, { status: 404 });

  const product = await createProduct({
    tenantId: academy.tenantId,
    academyId,
    sku: fields.sku ?? null,
    name: fields.name,
    description: fields.description ?? null,
    productType: fields.productType ?? "physical",
    priceCents: fields.priceCents,
    currency: fields.currency ?? "EUR",
    isActive: fields.isActive ?? true,
    isFeatured: fields.isFeatured ?? false,
    stockQuantity: fields.stockQuantity ?? null,
    lowStockThreshold: fields.lowStockThreshold ?? 5,
    imageUrls: fields.imageUrls ?? [],
    metadata: fields.metadata ?? {},
    visibility: fields.visibility ?? "public",
    publishedAt: fields.isActive === false ? null : new Date(),
  });

  return NextResponse.json(product, { status: 201 });
}

import { sql } from "drizzle-orm";
