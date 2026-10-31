export const dynamic = 'force-dynamic';

import { and, eq, sql } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-response";
import { z } from "zod";

import { db } from "@/db";
import { charges } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { handleApiError } from "@/lib/api-error-handler";
import { logEvent } from "@/lib/event-logging";
import { withTransaction } from "@/lib/db-transactions";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";

const UpdateChargeSchema = z.object({
  status: z.enum(["pending", "paid", "overdue", "cancelled", "partial"]).optional(),
  paymentMethod: z.enum(["cash", "transfer", "bizum", "card_manual", "other"]).optional().nullable(),
  paidAt: z.string().optional().nullable(), // ISO date string
  notes: z.string().optional().nullable(),
  label: z.string().min(1).optional(),
  amountCents: z.number().int().positive().optional(),
  dueDate: z.string().optional().nullable(),
});

export const PATCH = withTenant(async (request, context) => {
  try {
    // Extract chargeId from URL path
    const url = new URL(request.url);
    const pathMatch = url.pathname.match(/^\/api\/charges\/([^/]+)/);
    const chargeId = pathMatch?.[1];

    if (!chargeId) {
      return apiError("CHARGE_ID_REQUIRED", "Charge ID is required", 400);
    }

    const body = UpdateChargeSchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    // Verify charge exists and belongs to tenant
    const [existing] = await db
      .select()
      .from(charges)
      .where(and(eq(charges.id, chargeId), eq(charges.tenantId, context.tenantId)))
      .limit(1);

    if (!existing) {
      return apiError("CHARGE_NOT_FOUND", "Charge not found", 404);
    }

    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: existing.tenantId,
      academyId: existing.academyId,
      permission: "billing:update",
    });
    if (!scope.allowed) {
      return apiError("CHARGE_NOT_FOUND", "Charge not found", 404);
    }

    const updateData: Partial<typeof charges.$inferInsert> = {};

    if (body.status !== undefined) {
      updateData.status = body.status;
      // If status is changed to paid, set paidAt if not already set
      if (body.status === "paid" && !existing.paidAt) {
        updateData.paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
      } else if (body.status !== "paid" && existing.paidAt) {
        // If status is changed from paid, clear paidAt
        updateData.paidAt = null;
      }
    }

    if (body.paymentMethod !== undefined) {
      updateData.paymentMethod = body.paymentMethod;
    }

    if (body.paidAt !== undefined) {
      updateData.paidAt = body.paidAt ? new Date(body.paidAt) : null;
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }

    if (body.label !== undefined) {
      updateData.label = body.label;
    }

    if (body.amountCents !== undefined) {
      updateData.amountCents = body.amountCents;
    }

    if (body.dueDate !== undefined) {
      updateData.dueDate = body.dueDate ? body.dueDate.split("T")[0] : null;
    }

    // Estados terminales no mutables: ni resurrect ni ediciones de importes
    // sobre cargos ya cobrados/reembolsados (romperían la conciliación).
    if (["paid", "refunded"].includes(existing.status)) {
      const mutableFields = Object.keys(updateData).filter((key) =>
        ["notes", "label", "dueDate", "paymentMethod"].includes(key)
      );
      if (mutableFields.length !== Object.keys(updateData).length || body.status) {
        return apiError("CHARGE_IMMUTABLE", `El cargo está ${existing.status}; solo notes/label/fecha/paymentMethod son editables`, 409);
      }
    }

    const [updated] = await withTransaction(async (tx) => {
      await lockAcademyOperationalWrites(tx, existing.academyId);
      await assertAcademyOperationalWritable(existing.tenantId, existing.academyId, tx);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${chargeId}))`);
      return tx
        .update(charges)
        .set(updateData)
        .where(and(eq(charges.id, chargeId), eq(charges.tenantId, existing.tenantId)))
        .returning();
    });

    // Log event when charge is marked as paid
    if (body.status === "paid" && existing.status !== "paid") {
      await logEvent({
        academyId: existing.academyId,
        eventType: "charge_marked_paid",
        metadata: {
          chargeId: updated.id,
          athleteId: updated.athleteId,
          amountCents: updated.amountCents,
          paymentMethod: updated.paymentMethod,
        },
      });
    }

    return apiSuccess({ charge: updated });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/charges/[chargeId]", method: "PATCH" });
  }
});

export const DELETE = withTenant(async (request, context) => {
  try {
    // Extract chargeId from URL path
    const url = new URL(request.url);
    const pathMatch = url.pathname.match(/^\/api\/charges\/([^/]+)/);
    const chargeId = pathMatch?.[1];

    if (!chargeId) {
      return apiError("CHARGE_ID_REQUIRED", "Charge ID is required", 400);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    // Verify charge exists and belongs to tenant
    const [existing] = await db
      .select()
      .from(charges)
      .where(and(eq(charges.id, chargeId), eq(charges.tenantId, context.tenantId)))
      .limit(1);

    if (!existing) {
      return apiError("CHARGE_NOT_FOUND", "Charge not found", 404);
    }

    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: existing.tenantId,
      academyId: existing.academyId,
      permission: "billing:update",
    });
    if (!scope.allowed) {
      return apiError("CHARGE_NOT_FOUND", "Charge not found", 404);
    }

    await withTransaction(async (tx) => {
      await lockAcademyOperationalWrites(tx, existing.academyId);
      await assertAcademyOperationalWritable(existing.tenantId, existing.academyId, tx);
      await tx.delete(charges).where(and(eq(charges.id, chargeId), eq(charges.tenantId, context.tenantId!)));
    });

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/charges/[chargeId]", method: "DELETE" });
  }
});
