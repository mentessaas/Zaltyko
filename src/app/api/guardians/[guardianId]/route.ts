export const dynamic = 'force-dynamic';

import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, guardians, guardianAthletes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError } from "@/lib/api-response";
import { withTransaction, type DatabaseClient } from "@/lib/db-transactions";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";

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
  requestedAthleteId?: string | null,
  client: DatabaseClient = db
) {
  return client
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

async function lockWritableGuardianAcademies(
  client: DatabaseClient,
  guardianId: string,
  tenantId: string
): Promise<boolean> {
  const linkedAthletes = await client
    .select({ academyId: athletes.academyId })
    .from(guardianAthletes)
    .innerJoin(athletes, eq(guardianAthletes.athleteId, athletes.id))
    .where(and(
      eq(guardianAthletes.guardianId, guardianId),
      eq(guardianAthletes.tenantId, tenantId),
      eq(athletes.tenantId, tenantId),
      isNull(athletes.deletedAt),
    ))
    .orderBy(asc(athletes.academyId));

  const academyIds = [...new Set(linkedAthletes.map((row) => row.academyId))].sort();
  if (academyIds.length === 0) return false;

  // Acquire all affected scopes before the subscription locks in the capacity
  // guard, matching the deterministic lock order used by multi-academy webhooks.
  for (const academyId of academyIds) {
    await lockAcademyOperationalWrites(client, academyId);
  }
  for (const academyId of academyIds) {
    await assertAcademyOperationalWritable(tenantId, academyId, client);
  }

  return true;
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

    const updated = await withTransaction(async (tx) => {
      const [current] = await tx
        .select({
          id: guardians.id,
          name: guardians.name,
          email: guardians.email,
          phone: guardians.phone,
          relationship: guardians.relationship,
          notifyEmail: guardians.notifyEmail,
          notifySms: guardians.notifySms,
        })
        .from(guardians)
        .where(and(eq(guardians.id, guardianId), eq(guardians.tenantId, context.tenantId!)))
        .limit(1);
      if (!current) return false;

      const currentScope = await getGuardianScope(guardianId, context.tenantId!, requestedAthleteId, tx);
      if (!currentScope) return false;
      if (!(await lockWritableGuardianAcademies(tx, guardianId, context.tenantId!))) return false;

      await tx
        .update(guardians)
        .set({
          name: body.name ?? current.name,
          email: body.email ?? current.email,
          phone: body.phone ?? current.phone,
          relationship: body.relationship ?? current.relationship,
          notifyEmail: body.notifyEmail ?? current.notifyEmail,
          notifySms: body.notifySms ?? current.notifySms,
        })
        .where(and(eq(guardians.id, guardianId), eq(guardians.tenantId, context.tenantId!)));
      return true;
    });
    if (!updated) return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);

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

    const deleted = await withTransaction(async (tx) => {
      const [current] = await tx
        .select({ id: guardians.id })
        .from(guardians)
        .where(and(eq(guardians.id, guardianId), eq(guardians.tenantId, context.tenantId!)))
        .limit(1);
      if (!current) return false;

      const currentScope = await getGuardianScope(guardianId, context.tenantId!, requestedAthleteId, tx);
      if (!currentScope) return false;
      if (!(await lockWritableGuardianAcademies(tx, guardianId, context.tenantId!))) return false;

      // Delete guardian (cascades to guardianAthletes due to FK).
      await tx
        .delete(guardians)
        .where(and(eq(guardians.id, guardianId), eq(guardians.tenantId, context.tenantId!)));
      return true;
    });
    if (!deleted) return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});
