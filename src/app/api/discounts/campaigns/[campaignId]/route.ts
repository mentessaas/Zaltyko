import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/authz";

import { db } from "@/db";
import { discountCampaigns, discounts } from "@/db/schema";

const updateCampaignSchema = z.object({
  discountId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  maxUses: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const { discountId } = context.params as { discountId: string };

  const [campaign] = await db
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
        eq(discountCampaigns.id, discountId),
        eq(discountCampaigns.tenantId, context.tenantId)
      )
    )
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ error: "CAMPAIGN_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    ...campaign,
    discountValue: Number(campaign.discountValue),
    currentUses: Number(campaign.currentUses),
  });
});

export const PUT = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const { discountId } = context.params as { discountId: string };
  const body = updateCampaignSchema.parse(await request.json());

  // Verificar que la campaña existe
  const [existing] = await db
    .select({ id: discountCampaigns.id })
    .from(discountCampaigns)
    .where(
      and(
        eq(discountCampaigns.id, discountId),
        eq(discountCampaigns.tenantId, context.tenantId)
      )
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "CAMPAIGN_NOT_FOUND" }, { status: 404 });
  }

  // Si se proporciona un nuevo discountId, verificar que existe
  if (body.discountId) {
    const [discount] = await db
      .select({ id: discounts.id })
      .from(discounts)
      .where(
        and(
          eq(discounts.id, body.discountId),
          eq(discounts.tenantId, context.tenantId)
        )
      )
      .limit(1);

    if (!discount) {
      return NextResponse.json({ error: "DISCOUNT_NOT_FOUND" }, { status: 404 });
    }
  }

  const [updated] = await db
    .update(discountCampaigns)
    .set({
      ...body,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(discountCampaigns.id, discountId),
        eq(discountCampaigns.tenantId, context.tenantId)
      )
    )
    .returning({ id: discountCampaigns.id });

  return NextResponse.json({ ok: true, id: updated.id });
});

export const DELETE = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const { discountId } = context.params as { discountId: string };

  const [deleted] = await db
    .delete(discountCampaigns)
    .where(
      and(
        eq(discountCampaigns.id, discountId),
        eq(discountCampaigns.tenantId, context.tenantId)
      )
    )
    .returning({ id: discountCampaigns.id });

  if (!deleted) {
    return NextResponse.json({ error: "CAMPAIGN_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
});
