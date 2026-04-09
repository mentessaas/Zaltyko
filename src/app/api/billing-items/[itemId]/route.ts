import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { billingItems } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError } from "@/lib/api-response";

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
      return apiError("ITEM_ID_REQUIRED", "ID de item requerido", 400);
    }
    const body = UpdateBillingItemSchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }

    // Verify item exists and belongs to tenant
    const [existing] = await db
      .select()
      .from(billingItems)
      .where(and(eq(billingItems.id, itemId), eq(billingItems.tenantId, context.tenantId)))
      .limit(1);

    if (!existing) {
      return apiError("BILLING_ITEM_NOT_FOUND", "Item de facturación no encontrado", 404);
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

    return apiSuccess({ item: updated });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/billing-items/[itemId]", method: "PATCH" });
  }
});

export const DELETE = withTenant(async (request, context) => {
  try {
    const params = context.params as { itemId?: string };
    const itemId = params?.itemId;

    if (!itemId) {
      return apiError("ITEM_ID_REQUIRED", "ID de item requerido", 400);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }

    // Verify item exists and belongs to tenant
    const [existing] = await db
      .select()
      .from(billingItems)
      .where(and(eq(billingItems.id, itemId), eq(billingItems.tenantId, context.tenantId)))
      .limit(1);

    if (!existing) {
      return apiError("BILLING_ITEM_NOT_FOUND", "Item de facturación no encontrado", 404);
    }

    await db.delete(billingItems).where(eq(billingItems.id, itemId));

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/billing-items/[itemId]", method: "DELETE" });
  }
});
