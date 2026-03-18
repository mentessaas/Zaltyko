export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/authz";

import { db } from "@/db";
import { discountCampaigns, discounts } from "@/db/schema";

const createCampaignSchema = z.object({
  academyId: z.string().uuid(),
  discountId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
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
    .select({
      id: discountCampaigns.id,
      discountId: discountCampaigns.discountId,
      discountName: discounts.name,
      discountCode: discounts.code,
      discountValue: discounts.discountValue,
      discountType: discounts.discountType,
      name: discountCampaigns.name,
      description: discountCampaigns.description,
      startDate: discountCampaigns.startDate,
      endDate: discountCampaigns.endDate,
      maxUses: discountCampaigns.maxUses,
      currentUses: discountCampaigns.currentUses,
      isActive: discountCampaigns.isActive,
      createdAt: discountCampaigns.createdAt,
    })
    .from(discountCampaigns)
    .innerJoin(discounts, eq(discountCampaigns.discountId, discounts.id))
    .where(
      and(
        eq(discountCampaigns.academyId, academyId),
        eq(discountCampaigns.tenantId, context.tenantId)
      )
    );

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      discountValue: Number(item.discountValue),
      currentUses: Number(item.currentUses),
    })),
  });
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = context.profile;

  const body = createCampaignSchema.parse(await request.json());

  // Verificar que el descuento existe
  const [discount] = await db
    .select({ id: discounts.id })
    .from(discounts)
    .where(
      and(
        eq(discounts.id, body.discountId),
        eq(discounts.academyId, body.academyId),
        eq(discounts.tenantId, context.tenantId)
      )
    )
    .limit(1);

  if (!discount) {
    return NextResponse.json({ error: "DISCOUNT_NOT_FOUND" }, { status: 404 });
  }

  const [newCampaign] = await db
    .insert(discountCampaigns)
    .values({
      tenantId: context.tenantId,
      academyId: body.academyId,
      discountId: body.discountId,
      name: body.name,
      description: body.description || null,
      startDate: body.startDate,
      endDate: body.endDate || null,
      maxUses: body.maxUses || null,
      isActive: body.isActive,
      createdBy: profile.id,
    })
    .returning({ id: discountCampaigns.id });

  return NextResponse.json({ ok: true, id: newCampaign.id });
});
