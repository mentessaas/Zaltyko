import { apiError, apiSuccess } from "@/lib/api-response";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  athletes,
  coaches,
  groupAthletes,
  groups,
} from "@/db/schema";
import { TenantContext, withTenant } from "@/lib/authz";
import { rateLimit, getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { verifyAcademySportConfig } from "@/lib/sport-config/service";
import { isProgramCodeAllowed, normalizeApparatusCodes } from "@/lib/sport-config/validation";
import { assertCoachesCanHandleSportConfig } from "@/lib/coaches/sport-scope";

type RouteContext = TenantContext<{ params?: { groupId?: string } }>;

const DISCIPLINES = ["artistica", "ritmica", "general"] as const;

const GroupUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  discipline: z.enum(DISCIPLINES).optional(),
  sportConfigId: z.string().uuid().nullable().optional(),
  programCode: z.string().trim().min(1).max(80).nullable().optional(),
  levelCode: z.string().trim().min(1).max(80).nullable().optional(),
  categoryCode: z.string().trim().min(1).max(80).nullable().optional(),
  level: z.string().max(120).optional().nullable(),
  technicalFocus: z.string().max(500).optional().nullable(),
  apparatus: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  sessionBlocks: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
  coachId: z.string().uuid().nullable().optional(),
  assistantIds: z.array(z.string().uuid()).optional(),
  athleteIds: z.array(z.string().uuid()).optional(),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}){1,2}$/)
    .nullable()
    .optional(),
  monthlyFeeCents: z.number().int().min(0).nullable().optional(), // Cuota mensual en céntimos
  billingItemId: z.string().uuid().nullable().optional(), // Concepto de cobro asociado
});

// Handler for PATCH - separated to apply rate limiting
const patchGroupHandler = withTenant(async (request, context: RouteContext) => {
  const params = context.params as { groupId?: string };
  const groupId = params?.groupId;
  if (!groupId) {
    return apiError("GROUP_ID_REQUIRED", "Group ID is required", 400);
  }

  const [group] = await db
    .select({
      id: groups.id,
      tenantId: groups.tenantId,
      academyId: groups.academyId,
      sportConfigId: groups.sportConfigId,
      coachId: groups.coachId,
      assistantIds: groups.assistantIds,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) {
    return apiError("GROUP_NOT_FOUND", "Group not found", 404);
  }

  const role = context.profile.role;
  const isElevated = role === "super_admin" || role === "admin" || role === "owner";

  if (!isElevated) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  if (role !== "super_admin" && group.tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  const payload = GroupUpdateSchema.parse(await request.json());

  const effectiveSportConfigId =
    payload.sportConfigId !== undefined ? payload.sportConfigId : group.sportConfigId;
  const sportConfig = await verifyAcademySportConfig({
    academyId: group.academyId,
    tenantId: group.tenantId,
    sportConfigId: effectiveSportConfigId,
  });

  if (effectiveSportConfigId && !sportConfig) {
    return apiError("SPORT_CONFIG_NOT_FOUND", "La configuración deportiva no pertenece a esta academia", 404);
  }

  if (sportConfig) {
    if (!isProgramCodeAllowed(sportConfig, payload.programCode)) {
      return apiError("INVALID_PROGRAM", "El programa no está activo para esta rama/modalidad", 400);
    }

    const apparatusValidation = normalizeApparatusCodes(sportConfig, payload.apparatus);
    if (!apparatusValidation.ok) {
      return apiError("INVALID_APPARATUS", "Hay aparatos que no pertenecen a la rama seleccionada", 400);
    }
  }

  if (payload.coachId) {
    const [coachRow] = await db
      .select({ id: coaches.id })
      .from(coaches)
      .where(and(eq(coaches.id, payload.coachId), eq(coaches.academyId, group.academyId)))
      .limit(1);

    if (!coachRow) {
      return apiError("COACH_NOT_FOUND", "Coach not found", 404);
    }
  }

  const assistantIds = payload.assistantIds ? Array.from(new Set(payload.assistantIds)) : undefined;
  if (assistantIds && assistantIds.length) {
    const assistantRows = await db
      .select({ id: coaches.id })
      .from(coaches)
      .where(and(eq(coaches.academyId, group.academyId), inArray(coaches.id, assistantIds)));

    if (assistantRows.length !== assistantIds.length) {
      return apiError("ASSISTANT_NOT_FOUND", "Assistant not found", 404);
    }
  }

  const effectiveCoachIds = [
    payload.coachId !== undefined ? payload.coachId : group.coachId,
    ...(assistantIds !== undefined ? assistantIds : group.assistantIds ?? []),
  ].filter((value): value is string => Boolean(value));
  const coachScope = await assertCoachesCanHandleSportConfig({
    coachIds: effectiveCoachIds,
    academyId: group.academyId,
    tenantId: group.tenantId,
    sportConfigId: effectiveSportConfigId,
  });

  if (!coachScope.ok) {
    return apiError(
      coachScope.reason,
      coachScope.reason === "COACH_NOT_FOUND"
        ? "Uno o más entrenadores no pertenecen a esta academia"
        : "Uno o más entrenadores no pueden asignarse a esa rama/modalidad",
      coachScope.reason === "COACH_NOT_FOUND" ? 404 : 400
    );
  }

  const athleteIds = payload.athleteIds ? Array.from(new Set(payload.athleteIds)) : undefined;
  if (athleteIds && athleteIds.length) {
    const athleteRows = await db
      .select({ id: athletes.id })
      .from(athletes)
      .where(
        and(
          eq(athletes.academyId, group.academyId),
          eq(athletes.tenantId, group.tenantId),
          inArray(athletes.id, athleteIds)
        )
      );

    if (athleteRows.length !== athleteIds.length) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }
  }

  await db.transaction(async (tx) => {
    const updatePayload: Record<string, unknown> = {};
    if (payload.name !== undefined) updatePayload.name = payload.name.trim();
    if (payload.discipline !== undefined) updatePayload.discipline = payload.discipline;
    if (sportConfig) updatePayload.discipline = sportConfig.defaultAcademyType;
    if (payload.sportConfigId !== undefined) updatePayload.sportConfigId = payload.sportConfigId || null;
    if (payload.programCode !== undefined) updatePayload.programCode = payload.programCode || null;
    if (payload.levelCode !== undefined) updatePayload.levelCode = payload.levelCode || null;
    if (payload.categoryCode !== undefined) updatePayload.categoryCode = payload.categoryCode || null;
    if (payload.level !== undefined) updatePayload.level = payload.level || null;
    if (payload.technicalFocus !== undefined) updatePayload.technicalFocus = payload.technicalFocus?.trim() || null;
    if (payload.apparatus !== undefined) {
      updatePayload.apparatus = payload.apparatus.length
        ? Array.from(new Set(payload.apparatus.map((item) => item.trim()).filter(Boolean)))
        : null;
    }
    if (payload.sessionBlocks !== undefined) {
      updatePayload.sessionBlocks = payload.sessionBlocks.length
        ? Array.from(new Set(payload.sessionBlocks.map((item) => item.trim()).filter(Boolean)))
        : null;
    }
    if (payload.coachId !== undefined) updatePayload.coachId = payload.coachId || null;
    if (assistantIds !== undefined) {
      updatePayload.assistantIds = assistantIds.length ? assistantIds : null;
    }
    if (payload.color !== undefined) updatePayload.color = payload.color || null;
    if (payload.monthlyFeeCents !== undefined) updatePayload.monthlyFeeCents = payload.monthlyFeeCents ?? null;
    if (payload.billingItemId !== undefined) updatePayload.billingItemId = payload.billingItemId ?? null;

    if (Object.keys(updatePayload).length > 0) {
      await tx.update(groups).set(updatePayload).where(eq(groups.id, groupId));
    }

    if (athleteIds) {
      const current = await tx
        .select({ athleteId: groupAthletes.athleteId })
        .from(groupAthletes)
        .where(eq(groupAthletes.groupId, groupId));
      const currentIds = current.map((row) => row.athleteId);

      const toAdd = athleteIds.filter((id) => !currentIds.includes(id));
      const toRemove = currentIds.filter((id) => !athleteIds.includes(id));

      if (toAdd.length) {
        const values = toAdd.map((athleteId) => ({
          tenantId: group.tenantId,
          groupId,
          athleteId,
        }));
        await tx.insert(groupAthletes).values(values).onConflictDoNothing();
        await tx
          .update(athletes)
          .set({ groupId })
          .where(
            and(
              eq(athletes.tenantId, group.tenantId),
              eq(athletes.academyId, group.academyId),
              inArray(athletes.id, toAdd)
            )
          );
      }

      if (toRemove.length) {
        await tx
          .delete(groupAthletes)
          .where(and(eq(groupAthletes.groupId, groupId), inArray(groupAthletes.athleteId, toRemove)));

        await tx
          .update(athletes)
          .set({ groupId: null })
          .where(
            and(
              eq(athletes.groupId, groupId),
              eq(athletes.tenantId, group.tenantId),
              inArray(athletes.id, toRemove)
            )
          );
      }
    }
  });

  return apiSuccess({ ok: true });
});

// Rate-limited PATCH handler: 30 requests per minute
export const PATCH = withRateLimit(
  async (request, context) => {
    return (await patchGroupHandler(request, context)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 30, window: 60 }
);

// Handler for DELETE - separated to apply rate limiting
const deleteGroupHandler = withTenant(async (request, context: RouteContext) => {
  const params = context.params as { groupId?: string };
  const groupId = params?.groupId;
  if (!groupId) {
    return apiError("GROUP_ID_REQUIRED", "Group ID is required", 400);
  }

  const [group] = await db
    .select({
      id: groups.id,
      tenantId: groups.tenantId,
      academyId: groups.academyId,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) {
    return apiError("GROUP_NOT_FOUND", "Group not found", 404);
  }

  const role = context.profile.role;
  const isElevated = role === "super_admin" || role === "admin" || role === "owner";

  if (!isElevated) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  if (role !== "super_admin" && group.tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(athletes)
      .set({ groupId: null })
      .where(and(eq(athletes.groupId, groupId), eq(athletes.tenantId, group.tenantId)));

    await tx.delete(groupAthletes).where(eq(groupAthletes.groupId, groupId));
    await tx.delete(groups).where(eq(groups.id, groupId));
  });

  return apiSuccess({ ok: true });
});

// Rate-limited DELETE handler: 5 requests per minute
export const DELETE = withRateLimit(
  async (request, context) => {
    return (await deleteGroupHandler(request, context)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 5, window: 60 }
);
