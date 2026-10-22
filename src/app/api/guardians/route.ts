export const dynamic = 'force-dynamic';

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, guardians, guardianAthletes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";

const GuardianSchema = z.object({
  athleteId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  relationship: z.string().optional(),
  notifyEmail: z.boolean().optional(),
  notifySms: z.boolean().optional(),
});

const CreateBodySchema = z.object({
  academyId: z.string().uuid(),
  guardian: GuardianSchema,
  athleteIds: z.array(z.string().uuid()).max(100).optional(),
});

const filterSchema = z.object({
  athleteId: z.string().uuid().optional(),
  academyId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const filters = filterSchema.safeParse(Object.fromEntries(url.searchParams));

    if (!filters.success) {
      return handleApiError(filters.error);
    }

    const { athleteId, academyId, page = 1, limit = 50 } = filters.data;

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
    }

    let athleteScope: { id: string; academyId: string } | null = null;
    if (athleteId) {
      const [athlete] = await db
        .select({ id: athletes.id, academyId: athletes.academyId })
        .from(athletes)
        .where(
          and(
            eq(athletes.id, athleteId),
            eq(athletes.tenantId, context.tenantId),
            isNull(athletes.deletedAt)
          )
        )
        .limit(1);

      if (!athlete) {
        return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
      }
      athleteScope = athlete;
    }

    const targetAcademyId = academyId ?? athleteScope?.academyId ?? context.profile.activeAcademyId ?? null;
    if (targetAcademyId) {
      const academyScope = await authorizeAcademyCapability({
        context,
        resourceTenantId: context.tenantId,
        academyId: targetAcademyId,
        permission: "athletes:read",
      });

      if (!academyScope.allowed) {
        return apiError("GUARDIAN_NOT_FOUND", "No se encontraron tutores", 404);
      }
    } else if (context.profile.role !== "super_admin") {
      return apiError("ACADEMY_REQUIRED", "Academy ID is required", 400);
    }

    const pageSize = Math.min(200, Math.max(1, limit));
    const offset = (page - 1) * pageSize;

    // Build conditions
    const conditions = [sql`${guardians.tenantId} = ${context.tenantId}`];

    if (athleteId) {
      // Get guardian IDs associated with this athlete
      const guardianIds = await db
        .select({ guardianId: guardianAthletes.guardianId })
        .from(guardianAthletes)
        .innerJoin(athletes, eq(guardianAthletes.athleteId, athletes.id))
        .where(
          and(
            eq(guardianAthletes.athleteId, athleteId),
            eq(guardianAthletes.tenantId, context.tenantId),
            eq(athletes.tenantId, context.tenantId),
            targetAcademyId ? eq(athletes.academyId, targetAcademyId) : sql`true`,
            isNull(athletes.deletedAt)
          )
        )
        .limit(5000);

      const ids = guardianIds.map(g => g.guardianId).filter(Boolean);
      if (ids.length > 0) {
        conditions.push(sql`${guardians.id} = ANY(${ids})`);
      } else {
        // No guardians found for this athlete
        return apiSuccess([], { total: 0, page, pageSize });
      }
    }

    if (targetAcademyId && !athleteId) {
      conditions.push(
        sql`EXISTS (
          SELECT 1
          FROM guardian_athletes scoped_ga
          INNER JOIN athletes scoped_a ON scoped_a.id = scoped_ga.athlete_id
          WHERE scoped_ga.guardian_id = ${guardians.id}
            AND scoped_ga.tenant_id = ${context.tenantId}
            AND scoped_a.tenant_id = ${context.tenantId}
            AND scoped_a.academy_id = ${targetAcademyId}
            AND scoped_a.deleted_at IS NULL
        )`
      );
    }

    const whereClause = and(...conditions);

    // Get total count
    const countResult = await db
      .select({ value: sql<number>`count(*)` })
      .from(guardians)
      .where(whereClause);

    const total = Number(countResult?.[0]?.value ?? 0);

    // Get guardians with their athlete relationships
    const items = await db
      .select({
        id: guardians.id,
        name: guardians.name,
        email: guardians.email,
        phone: guardians.phone,
        relationship: guardians.relationship,
        notifyEmail: guardians.notifyEmail,
        notifySms: guardians.notifySms,
        profileId: guardians.profileId,
        createdAt: guardians.createdAt,
      })
      .from(guardians)
      .where(whereClause)
      .orderBy(asc(guardians.name))
      .limit(pageSize)
      .offset(offset);

    // Get athlete associations for each guardian
    const guardianIds = items.map(g => g.id);
    const athleteAssociations: Record<string, Array<{ athleteId: string; athleteName: string; relationship: string | null; isPrimary: boolean }>> = {};

    if (guardianIds.length > 0) {
      const associations = await db
        .select({
          guardianId: guardianAthletes.guardianId,
          athleteId: guardianAthletes.athleteId,
          relationship: guardianAthletes.relationship,
          isPrimary: guardianAthletes.isPrimary,
          athleteName: athletes.name,
        })
        .from(guardianAthletes)
        .innerJoin(athletes, eq(guardianAthletes.athleteId, athletes.id))
        .where(
          and(
            sql`${guardianAthletes.guardianId} = ANY(${guardianIds})`,
            eq(guardianAthletes.tenantId, context.tenantId),
            eq(athletes.tenantId, context.tenantId),
            targetAcademyId ? eq(athletes.academyId, targetAcademyId) : sql`true`,
            isNull(athletes.deletedAt)
          )
        )
        .limit(10000);

      for (const assoc of associations) {
        if (!athleteAssociations[assoc.guardianId]) {
          athleteAssociations[assoc.guardianId] = [];
        }
        if (assoc.athleteId) {
          athleteAssociations[assoc.guardianId].push({
            athleteId: assoc.athleteId,
            athleteName: assoc.athleteName ?? "Unknown",
            relationship: assoc.relationship,
            isPrimary: assoc.isPrimary ?? false,
          });
        }
      }
    }

    const itemsWithAthletes = items.map(g => ({
      ...g,
      athletes: athleteAssociations[g.id] ?? [],
    }));

    return apiSuccess(itemsWithAthletes, { total, page, pageSize });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = CreateBodySchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
    }

    const academyScope = await authorizeAcademyCapability({
      context,
      resourceTenantId: context.tenantId,
      academyId: body.academyId,
      permission: "athletes:create",
    });

    if (!academyScope.allowed) {
      return apiError(academyScope.reason ?? "FORBIDDEN", "No tienes permisos para crear tutores en esta academia", 403);
    }

    const guardianId = crypto.randomUUID();

    if (body.athleteIds?.length) {
      const scopedAthletes = await db
        .select({ id: athletes.id })
        .from(athletes)
        .where(and(
          eq(athletes.tenantId, context.tenantId),
          eq(athletes.academyId, body.academyId),
          inArray(athletes.id, body.athleteIds),
          isNull(athletes.deletedAt),
        ))
        .limit(100);
      if (scopedAthletes.length !== new Set(body.athleteIds).size) {
        return apiError("ATHLETE_ACCESS_DENIED", "One or more athletes do not belong to this academy", 403);
      }
    }

    // Create guardian
    await db.insert(guardians).values({
      id: guardianId,
      tenantId: context.tenantId,
      name: body.guardian.name,
      email: body.guardian.email || null,
      phone: body.guardian.phone || null,
      relationship: body.guardian.relationship || null,
      notifyEmail: body.guardian.notifyEmail ?? true,
      notifySms: body.guardian.notifySms ?? false,
    });

    // Associate with athletes if provided
    if (body.athleteIds?.length) {
      const associations = body.athleteIds.map(athleteId => ({
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        guardianId,
        athleteId,
        relationship: body.guardian.relationship || null,
        isPrimary: false,
      }));

      await db.insert(guardianAthletes).values(associations).onConflictDoNothing();
    }

    return apiCreated({ id: guardianId });
  } catch (error) {
    return handleApiError(error);
  }
});
