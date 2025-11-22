import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { withTenant } from "@/lib/authz";

import { db } from "@/db";
import { discounts } from "@/db/schema";

const updateSchema = z.object({
  code: z.string().nullable().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  discountType: z.enum(["percentage", "fixed"]).optional(),
  discountValue: z.number().positive().optional(),
  applicableTo: z.string().optional(),
  minAmount: z.number().nullable().optional(),
  maxDiscount: z.number().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  maxUses: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const PUT = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const discountId = (context.params as { discountId?: string } | undefined)?.discountId;

  if (!discountId) {
    return NextResponse.json({ error: "DISCOUNT_ID_REQUIRED" }, { status: 400 });
  }

  const body = updateSchema.parse(await request.json());

  // Verificar código duplicado si se está actualizando
  if (body.code) {
    const [existing] = await db
      .select()
      .from(discounts)
      .where(
        and(
          eq(discounts.code, body.code),
          sql`${discounts.id} != ${discountId}`
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({ error: "CODE_ALREADY_EXISTS" }, { status: 400 });
    }
  }

  const updateData: any = {
    updatedAt: new Date(),
  };

  if (body.code !== undefined) updateData.code = body.code || null;
  if (body.name) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description || null;
  if (body.discountType) updateData.discountType = body.discountType;
  if (body.discountValue) updateData.discountValue = body.discountValue.toString();
  if (body.applicableTo) updateData.applicableTo = body.applicableTo;
  if (body.minAmount !== undefined) updateData.minAmount = body.minAmount ? body.minAmount.toString() : null;
  if (body.maxDiscount !== undefined) updateData.maxDiscount = body.maxDiscount ? body.maxDiscount.toString() : null;
  if (body.startDate) updateData.startDate = body.startDate;
  if (body.endDate !== undefined) updateData.endDate = body.endDate || null;
  if (body.maxUses !== undefined) updateData.maxUses = body.maxUses || null;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  await db
    .update(discounts)
    .set(updateData)
    .where(and(eq(discounts.id, discountId), eq(discounts.tenantId, context.tenantId)));

  return NextResponse.json({ ok: true });
});

export const DELETE = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const discountId = (context.params as { discountId?: string } | undefined)?.discountId;

  if (!discountId) {
    return NextResponse.json({ error: "DISCOUNT_ID_REQUIRED" }, { status: 400 });
  }

  await db
    .delete(discounts)
    .where(and(eq(discounts.id, discountId), eq(discounts.tenantId, context.tenantId)));

  return NextResponse.json({ ok: true });
});

