import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withTenant, getCurrentProfile } from "@/lib/authz";

import { db } from "@/db";
import { discounts } from "@/db/schema";

const createSchema = z.object({
  academyId: z.string().uuid(),
  code: z.string().nullable().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  discountType: z.enum(["percentage", "fixed"]).default("percentage"),
  discountValue: z.number().positive(),
  applicableTo: z.string().default("all"),
  minAmount: z.number().nullable().optional(),
  maxDiscount: z.number().nullable().optional(),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  maxUses: z.number().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  const items = await db
    .select()
    .from(discounts)
    .where(and(eq(discounts.academyId, academyId), eq(discounts.tenantId, context.tenantId)));

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      discountValue: Number(item.discountValue),
      minAmount: item.minAmount ? Number(item.minAmount) : null,
      maxDiscount: item.maxDiscount ? Number(item.maxDiscount) : null,
      currentUses: Number(item.currentUses),
    })),
  });
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = await getCurrentProfile(request);
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = createSchema.parse(await request.json());

  // Verificar que el código no esté duplicado
  if (body.code) {
    const [existing] = await db
      .select()
      .from(discounts)
      .where(
        and(
          eq(discounts.academyId, body.academyId),
          eq(discounts.code, body.code)
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({ error: "CODE_ALREADY_EXISTS" }, { status: 400 });
    }
  }

  const [newDiscount] = await db
    .insert(discounts)
    .values({
      tenantId: context.tenantId,
      academyId: body.academyId,
      code: body.code || null,
      name: body.name,
      description: body.description || null,
      discountType: body.discountType,
      discountValue: body.discountValue.toString(),
      applicableTo: body.applicableTo,
      minAmount: body.minAmount ? body.minAmount.toString() : null,
      maxDiscount: body.maxDiscount ? body.maxDiscount.toString() : null,
      startDate: body.startDate,
      endDate: body.endDate || null,
      maxUses: body.maxUses || null,
      isActive: body.isActive,
      createdBy: profile.id,
    })
    .returning({ id: discounts.id });

  return NextResponse.json({ ok: true, id: newDiscount.id });
});

