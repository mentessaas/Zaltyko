export const dynamic = 'force-dynamic';

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, guardians, guardianAthletes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError } from "@/lib/api-response";

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  relationship: z.string().optional(),
  notifyEmail: z.boolean().optional(),
  notifySms: z.boolean().optional(),
});

async function getGuardianScope(
  guardianId: string,
  tenantId: string,
  requestedAthleteId?: string | null
) {
  return db
    .select({
      guardianId: guardians.id,
      tenantId: guardians.tenantId,
      academyId: athletes.academyId,
      athleteId: athletes.id,
    })
    .from(guardians)
    .innerJoin(guardianAthletes, eq(guardianAthletes.guardianId, guardians.id))
    .innerJoin(athletes, eq(guardianAthletes.athleteId, athletes.id))
    .where(
      and(
        eq(guardians.id, guardianId),
        eq(guardians.tenantId, tenantId),
        eq(guardianAthletes.tenantId, tenantId),
        eq(athletes.tenantId, tenantId),
        isNull(athletes.deletedAt),
        requestedAthleteId ? eq(athletes.id, requestedAthleteId) : undefined
      )
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

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

    const requestedAthleteId = new URL(request.url).searchParams.get("athleteId");
    const scopeResource = await getGuardianScope(guardianId, context.tenantId, requestedAthleteId);
    if (!scopeResource) {
      return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
    }

    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: scopeResource.tenantId,
      academyId: scopeResource.academyId,
      permission: "athletes:read",
    });
    if (!scope.allowed) return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);

    // Get athlete associations
    const associations = await db
      .select({
        athleteId: guardianAthletes.athleteId,
        relationship: guardianAthletes.relationship,
        isPrimary: guardianAthletes.isPrimary,
      })
      .from(guardianAthletes)
      .innerJoin(athletes, eq(guardianAthletes.athleteId, athletes.id))
      .where(
        and(
          eq(guardianAthletes.guardianId, guardianId),
          eq(guardianAthletes.tenantId, context.tenantId),
          eq(athletes.tenantId, context.tenantId),
          isNull(athletes.deletedAt),
          requestedAthleteId ? eq(athletes.id, requestedAthleteId) : undefined
        )
      )
      .limit(100);

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

    const requestedAthleteId = new URL(request.url).searchParams.get("athleteId");
    const scopeResource = await getGuardianScope(guardianId, context.tenantId, requestedAthleteId);
    if (!scopeResource) {
      return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
    }

    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: scopeResource.tenantId,
      academyId: scopeResource.academyId,
      permission: "athletes:update",
    });
    if (!scope.allowed) return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);

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
      .where(and(eq(guardians.id, guardianId), eq(guardians.tenantId, context.tenantId)));

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

    const requestedAthleteId = new URL(request.url).searchParams.get("athleteId");
    const scopeResource = await getGuardianScope(guardianId, context.tenantId, requestedAthleteId);
    if (!scopeResource) {
      return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
    }

    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: scopeResource.tenantId,
      academyId: scopeResource.academyId,
      permission: "athletes:delete",
    });
    if (!scope.allowed) return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);

    // Delete guardian (cascades to guardianAthletes due to FK)
    await db
      .delete(guardians)
      .where(and(eq(guardians.id, guardianId), eq(guardians.tenantId, context.tenantId)));

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});
