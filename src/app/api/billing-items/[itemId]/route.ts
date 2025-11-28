import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { billingItems } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";

const UpdateBillingItemSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  amountCents: z.number().int().positive().optional(),
  currency: z.string().optional(),
  periodicity: z.enum(["one_time", "monthly", "yearly"]).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withTenant(async (request, context) => {
  try {
    const params = context.params as { itemId?: string };
    const itemId = params?.itemId;
    
    if (!itemId) {
      return NextResponse.json({ error: "ITEM_ID_REQUIRED" }, { status: 400 });
    }
    const body = UpdateBillingItemSchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify item exists and belongs to tenant
    const [existing] = await db
      .select()
      .from(billingItems)
      .where(and(eq(billingItems.id, itemId), eq(billingItems.tenantId, context.tenantId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "BILLING_ITEM_NOT_FOUND" }, { status: 404 });
    }

    const updateData: Partial<typeof billingItems.$inferInsert> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description ?? null;
    if (body.amountCents !== undefined) updateData.amountCents = body.amountCents;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.periodicity !== undefined) updateData.periodicity = body.periodicity;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const [updated] = await db
      .update(billingItems)
      .set(updateData)
      .where(eq(billingItems.id, itemId))
      .returning();

    return NextResponse.json({ item: updated });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/billing-items/[itemId]", method: "PATCH" });
  }
});

export const DELETE = withTenant(async (request, context) => {
  try {
    const params = context.params as { itemId?: string };
    const itemId = params?.itemId;
    
    if (!itemId) {
      return NextResponse.json({ error: "ITEM_ID_REQUIRED" }, { status: 400 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify item exists and belongs to tenant
    const [existing] = await db
      .select()
      .from(billingItems)
      .where(and(eq(billingItems.id, itemId), eq(billingItems.tenantId, context.tenantId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "BILLING_ITEM_NOT_FOUND" }, { status: 404 });
    }

    await db.delete(billingItems).where(eq(billingItems.id, itemId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/billing-items/[itemId]", method: "DELETE" });
  }
});

