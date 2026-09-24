import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { products, academies } from "@/db/schema";
import { productVariants, type NewProductVariant } from "@/db/schema/variants";
import { getCurrentUser } from "@/lib/auth/current-user";

async function assertOwnerOfProduct(productId: string, userId: string) {
  const [ok] = await db
    .select({ id: products.id })
    .from(products)
    .innerJoin(sql`academies`, sql`${products.academyId} = ${academies.id}`)
    .innerJoin(sql`profiles`, sql`${academies.ownerId} = ${sql.raw("profiles.id")}`)
    .where(sql`${products.id} = ${productId} AND ${sql.raw("profiles.user_id")} = ${userId}`)
    .limit(1);
  return ok;
}

/**
 * GET /api/products/[id]/variants
 * Lista variantes del producto (público si el producto está activo).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // A variant is public only when its parent product is explicitly published.
  // Checking the variant flag alone exposed variants of drafts and members-only
  // products to a caller who guessed the parent UUID.
  const [parent] = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.id, params.id),
        eq(products.isActive, true),
        eq(products.visibility, "public"),
        isNotNull(products.publishedAt)
      )
    )
    .limit(1);
  if (!parent) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(
    await db
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, params.id),
          eq(productVariants.isActive, true)
        )
      )
      .orderBy(productVariants.sortOrder, productVariants.name)
      .limit(100)
  );
}

/**
 * POST /api/products/[id]/variants
 * Body: { name, sku?, attributes?, priceCents, currency?, stockQuantity?, sortOrder? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await assertOwnerOfProduct(params.id, user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.name || typeof body.priceCents !== "number") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const [parent] = await db
    .select({ currency: products.currency })
    .from(products)
    .where(eq(products.id, params.id))
    .limit(1);
  if (!parent) return NextResponse.json({ error: "product_not_found" }, { status: 404 });

  const data: NewProductVariant = {
    productId: params.id,
    sku: body.sku ?? null,
    name: body.name,
    attributes: body.attributes ?? [],
    priceCents: body.priceCents,
    currency: body.currency ?? parent.currency,
    stockQuantity: body.stockQuantity ?? null,
    sortOrder: body.sortOrder ?? 0,
  };
  const [created] = await db.insert(productVariants).values(data).returning();
  return NextResponse.json(created, { status: 201 });
}
