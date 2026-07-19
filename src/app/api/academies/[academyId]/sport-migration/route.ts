import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  athleteSportConfigs,
  athletes,
  classes,
  coaches,
  coachSportConfigs,
  groups,
} from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademySportConfig } from "@/lib/sport-config/service";

const migrationSchema = z.object({
  entityType: z.enum(["athletes", "groups", "classes", "coaches"]),
  sportConfigId: z.string().uuid(),
  ids: z.array(z.string().uuid()).optional().default([]),
  applyAll: z.boolean().optional().default(false),
});

async function getAuthorizedAcademy(params: {
  academyId: string;
  tenantId: string;
  profileId: string;
  role: string;
}) {
  const [academy] = await db
    .select({
      id: academies.id,
      tenantId: academies.tenantId,
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(eq(academies.id, params.academyId))
    .limit(1);

  if (!academy) return { error: apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404), academy: null };

  const isSuperAdmin = params.role === "super_admin";
  const isOwner = academy.ownerId === params.profileId;
  const isSameTenant = academy.tenantId === params.tenantId;

  if (!isSuperAdmin && !isOwner && !isSameTenant) {
    return { error: apiError("FORBIDDEN", "No tienes permisos para ver esta academia", 403), academy: null };
  }

  return { error: null, academy };
}

export const GET = withTenant(async (_request, context) => {
  try {
    const academyId = (context.params as { academyId?: string })?.academyId;
    if (!academyId) {
      return apiError("ACADEMY_ID_REQUIRED", "academyId es requerido", 400);
    }

    const { error, academy } = await getAuthorizedAcademy({
      academyId,
      tenantId: context.tenantId,
      profileId: context.profile.id,
      role: context.profile.role,
    });
    if (error || !academy) return error;

    const [athleteRows, groupRows, classRows, coachRows] = await Promise.all([
      db
        .select({ id: athletes.id, name: athletes.name })
        .from(athletes)
        .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, academy.tenantId), isNull(athletes.deletedAt), isNull(athletes.primarySportConfigId)))
        .orderBy(athletes.name)
        .limit(50),
      db
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(and(eq(groups.academyId, academyId), eq(groups.tenantId, academy.tenantId), isNull(groups.deletedAt), isNull(groups.sportConfigId)))
        .orderBy(groups.name)
        .limit(50),
      db
        .select({ id: classes.id, name: classes.name })
        .from(classes)
        .where(and(eq(classes.academyId, academyId), eq(classes.tenantId, academy.tenantId), isNull(classes.deletedAt), isNull(classes.sportConfigId)))
        .orderBy(classes.name)
        .limit(50),
      db
        .select({ id: coaches.id, name: coaches.name })
        .from(coaches)
        .where(and(
          eq(coaches.academyId, academyId),
          eq(coaches.tenantId, academy.tenantId),
          sql`not exists (
            select 1
            from coach_sport_configs csc
            where csc.coach_id = ${coaches.id}
              and csc.tenant_id = ${academy.tenantId}
          )`
        ))
        .orderBy(coaches.name)
        .limit(50),
    ]);

    return apiSuccess({
      athletes: athleteRows,
      groups: groupRows,
      classes: classRows,
      coaches: coachRows,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/academies/[academyId]/sport-migration", method: "GET" });
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const academyId = (context.params as { academyId?: string })?.academyId;
    if (!academyId) {
      return apiError("ACADEMY_ID_REQUIRED", "academyId es requerido", 400);
    }

    const body = migrationSchema.parse(await request.json());
    if (!body.applyAll && body.ids.length === 0) {
      return apiError("IDS_REQUIRED", "Selecciona registros o usa applyAll", 400);
    }

    const { error, academy } = await getAuthorizedAcademy({
      academyId,
      tenantId: context.tenantId,
      profileId: context.profile.id,
      role: context.profile.role,
    });
    if (error || !academy) return error;

    const verifiedConfig = await verifyAcademySportConfig({
      academyId,
      tenantId: academy.tenantId,
      sportConfigId: body.sportConfigId,
    });

    if (!verifiedConfig) {
      return apiError("SPORT_CONFIG_NOT_FOUND", "La rama/modalidad no está activa en esta academia", 400);
    }

    const idFilter = body.applyAll ? undefined : body.ids;

    if (body.entityType === "athletes") {
      const rows = await db
        .select({ id: athletes.id })
        .from(athletes)
        .where(and(
          eq(athletes.academyId, academyId),
          eq(athletes.tenantId, academy.tenantId),
          isNull(athletes.deletedAt),
          isNull(athletes.primarySportConfigId),
          ...(idFilter ? [inArray(athletes.id, idFilter)] : [])
        ));

      const ids = rows.map((row) => row.id);
      if (ids.length > 0) {
        await db
          .update(athletes)
          .set({ primarySportConfigId: body.sportConfigId })
          .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, academy.tenantId), inArray(athletes.id, ids)));

        await db
          .insert(athleteSportConfigs)
          .values(ids.map((athleteId) => ({
            id: randomUUID(),
            tenantId: academy.tenantId,
            athleteId,
            academySportConfigId: body.sportConfigId,
          })))
          .onConflictDoNothing();
      }

      return apiSuccess({ updated: ids.length });
    }

    if (body.entityType === "groups") {
      const rows = await db
        .select({ id: groups.id })
        .from(groups)
        .where(and(
          eq(groups.academyId, academyId),
          eq(groups.tenantId, academy.tenantId),
          isNull(groups.deletedAt),
          isNull(groups.sportConfigId),
          ...(idFilter ? [inArray(groups.id, idFilter)] : [])
        ));
      const ids = rows.map((row) => row.id);
      if (ids.length > 0) {
        await db
          .update(groups)
          .set({ sportConfigId: body.sportConfigId })
          .where(and(eq(groups.academyId, academyId), eq(groups.tenantId, academy.tenantId), inArray(groups.id, ids)));
      }
      return apiSuccess({ updated: ids.length });
    }

    if (body.entityType === "coaches") {
      const rows = await db
        .select({ id: coaches.id })
        .from(coaches)
        .where(and(
          eq(coaches.academyId, academyId),
          eq(coaches.tenantId, academy.tenantId),
          sql`not exists (
            select 1
            from coach_sport_configs csc
            where csc.coach_id = ${coaches.id}
              and csc.tenant_id = ${academy.tenantId}
          )`,
          ...(idFilter ? [inArray(coaches.id, idFilter)] : [])
        ));
      const ids = rows.map((row) => row.id);
      if (ids.length > 0) {
        await db
          .insert(coachSportConfigs)
          .values(ids.map((coachId) => ({
            tenantId: academy.tenantId,
            coachId,
            academySportConfigId: body.sportConfigId,
          })))
          .onConflictDoNothing();
      }
      return apiSuccess({ updated: ids.length });
    }

    const rows = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(
        eq(classes.academyId, academyId),
        eq(classes.tenantId, academy.tenantId),
        isNull(classes.deletedAt),
        isNull(classes.sportConfigId),
        ...(idFilter ? [inArray(classes.id, idFilter)] : [])
      ));
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await db
        .update(classes)
        .set({ sportConfigId: body.sportConfigId })
        .where(and(eq(classes.academyId, academyId), eq(classes.tenantId, academy.tenantId), inArray(classes.id, ids)));
    }

    return apiSuccess({ updated: ids.length });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/academies/[academyId]/sport-migration", method: "POST" });
  }
});
