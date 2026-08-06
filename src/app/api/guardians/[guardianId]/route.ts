export const dynamic = 'force-dynamic';

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { guardians, guardianAthletes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError } from "@/lib/api-response";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  relationship: z.string().optional(),
  notifyEmail: z.boolean().optional(),
  notifySms: z.boolean().optional(),
});

const AddAthleteSchema = z.object({
  athleteId: z.string().uuid(),
  relationship: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const { guardianId } = context.params as { guardianId: string };

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
    }

    const [guardian] = await db
      .select()
      .from(guardians)
      .where(eq(guardians.id, guardianId))
      .limit(1);

    if (!guardian || guardian.tenantId !== context.tenantId) {
      return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
    }

    // Get athlete associations
    const associations = await db
      .select({
        athleteId: guardianAthletes.athleteId,
        relationship: guardianAthletes.relationship,
        isPrimary: guardianAthletes.isPrimary,
      })
      .from(guardianAthletes)
      .where(eq(guardianAthletes.guardianId, guardianId));

    return apiSuccess({
      ...guardian,
      athletes: associations,
    });
  } catch (error) {
    return handleApiError(error);
  }
});

export const PUT = withTenant(async (request, context) => {
  try {
    const { guardianId } = context.params as { guardianId: string };
    const body = UpdateSchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
    }

    // Verify guardian exists and belongs to tenant
    const [existing] = await db
      .select()
      .from(guardians)
      .where(eq(guardians.id, guardianId))
      .limit(1);

    if (!existing || existing.tenantId !== context.tenantId) {
      return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
    }

    await db
      .update(guardians)
      .set({
        name: body.name ?? existing.name,
        email: body.email ?? existing.email,
        phone: body.phone ?? existing.phone,
        relationship: body.relationship ?? existing.relationship,
        notifyEmail: body.notifyEmail ?? existing.notifyEmail,
        notifySms: body.notifySms ?? existing.notifySms,
      })
      .where(eq(guardians.id, guardianId));

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});

export const DELETE = withTenant(async (request, context) => {
  try {
    const { guardianId } = context.params as { guardianId: string };

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
    }

    // Verify guardian exists and belongs to tenant
    const [existing] = await db
      .select()
      .from(guardians)
      .where(eq(guardians.id, guardianId))
      .limit(1);

    if (!existing || existing.tenantId !== context.tenantId) {
      return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
    }

    // Delete guardian (cascades to guardianAthletes due to FK)
    await db.delete(guardians).where(eq(guardians.id, guardianId));

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});
