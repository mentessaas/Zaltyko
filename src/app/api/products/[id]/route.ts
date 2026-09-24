import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  deleteProduct,
  getProduct,
  updateProduct,
} from "@/lib/store/service";

const ProductPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(10000).nullable().optional(),
  sku: z.string().max(100).nullable().optional(),
  productType: z.enum(["physical", "digital", "camp_registration", "session_pack"]).optional(),
  priceCents: z.number().int().min(0).max(2147483647).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  stockQuantity: z.number().int().min(0).max(2147483647).nullable().optional(),
  lowStockThreshold: z.number().int().min(0).max(2147483647).optional(),
  imageUrls: z.array(z.string().url()).max(20).optional(),
  visibility: z.enum(["public", "members_only"]).optional(),
}).strict();

async function assertOwner(academyId: string, userId: string) {
  const [ok] = await db
    .select({ id: academies.id })
    .from(academies)
    .innerJoin(sql`profiles`, sql`${academies.ownerId} = ${sql.raw("profiles.id")}`)
    .where(
      sql`${academies.id} = ${academyId} AND ${sql.raw("profiles.user_id")} = ${userId}`
    )
    .limit(1);
  return ok;
}

async function getAcademyOfProduct(productId: string) {
  const { products } = await import("@/db/schema/store");
  const [row] = await db
    .select({ academyId: products.academyId })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  return row?.academyId ?? null;
}

/**
 * GET /api/products/[id]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const product = await getProduct(params.id);
  if (!product) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const user = await getCurrentUser();
  if (user && await assertOwner(product.academyId, user.id)) {
    return NextResponse.json(product);
  }
  if (!product.isActive || product.visibility !== "public" || !product.publishedAt) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Public catalog responses must not expose internal metadata or tenant IDs.
  const { id, name, description, productType, priceCents, currency, imageUrls } = product;
  return NextResponse.json({ id, name, description, productType, priceCents, currency, imageUrls });
}

/**
 * PATCH /api/products/[id]
 */
// @auth-flexible route-guard-reason: getCurrentUser verifies the session and assertOwner checks ownership before parsing the request.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const academyId = await getAcademyOfProduct(params.id);
  if (!academyId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await assertOwner(academyId, user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = ProductPatchSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const updated = await updateProduct(params.id, parsed.data);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(updated);
}

/**
 * DELETE /api/products/[id]
 * Soft delete: marca isActive=false para no perder historial de ventas.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const academyId = await getAcademyOfProduct(params.id);
  if (!academyId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await assertOwner(academyId, user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await updateProduct(params.id, { isActive: false });
  return NextResponse.json({ ok: true });
}
