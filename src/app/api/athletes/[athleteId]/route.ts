import { randomUUID } from "node:crypto";
import { eq, and, notInArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athleteSportConfigs, athletes, groupAthletes, groups } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { rateLimit, getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import { syncChargesForAthleteCurrentPeriod } from "@/lib/billing/sync-charges";
import { formatDateForDB } from "@/lib/validation/date-utils";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getAcademySportConfigOptions, verifyAcademySportConfig } from "@/lib/sport-config/service";
import {
  isCategoryCodeAllowed,
  isLevelCodeAllowed,
  isProgramCodeAllowed,
} from "@/lib/sport-config/validation";
import { NextResponse } from "next/server";

// Validador custom para fechas en actualización
const updateDateStringSchema = z
  .union([z.string().datetime(), z.string().length(10), z.literal(""), z.null()])
  .optional()
  .transform((val) => {
    if (!val || val === "" || val === null) return null;
    const parsed = new Date(val);
    if (Number.isNaN(parsed.getTime())) {
      return "INVALID"; // Marcador para indicar fecha inválida
    }
    return parsed;
  });

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  dob: updateDateStringSchema,
  level: z.string().max(120).nullable().optional(),
  status: z.enum(athleteStatusOptions).optional(),
  // groupId = grupo principal (compat). groupIds = conjunto multi-grupo a reconciliar.
  groupId: z.string().uuid().nullable().optional(),
  groupIds: z.array(z.string().uuid()).max(20).optional(),
  primarySportConfigId: z.string().uuid().nullable().optional(),
  programCode: z.string().trim().min(1).max(80).nullable().optional(),
  levelCode: z.string().trim().min(1).max(80).nullable().optional(),
  categoryCode: z.string().trim().min(1).max(80).nullable().optional(),
  age: z.number().int().min(0).optional(),
});

async function getAthleteTenant(athleteId: string) {
  const [row] = await db
    .select({
      id: athletes.id,
      tenantId: athletes.tenantId,
      academyId: athletes.academyId,
      primarySportConfigId: athletes.primarySportConfigId,
      programCode: athletes.programCode,
      levelCode: athletes.levelCode,
      categoryCode: athletes.categoryCode,
    })
    .from(athletes)
    .where(eq(athletes.id, athleteId))
    .limit(1);

  return row ?? null;
}

type PrimaryGroupRow = {
  id: string;
  sportConfigId: string | null;
  programCode: string | null;
  levelCode: string | null;
  categoryCode: string | null;
};

/**
 * Resuelve el conjunto de grupos objetivo a partir del body. `groupIds` tiene
 * prioridad (multi-grupo); `groupId` se mantiene por compatibilidad (grupo único
 * = principal). Si ninguno viene en el body, devuelve undefined (no tocar grupos).
 */
function resolveGroupTarget(body: { groupId?: string | null; groupIds?: string[] }): {
  targetGroupIds: string[] | undefined;
  primaryGroupId: string | null | undefined;
} {
  if (body.groupIds !== undefined) {
    const targetGroupIds = Array.from(new Set(body.groupIds));
    return { targetGroupIds, primaryGroupId: targetGroupIds[0] ?? null };
  }
  if (body.groupId !== undefined) {
    return {
      targetGroupIds: body.groupId ? [body.groupId] : [],
      primaryGroupId: body.groupId ?? null,
    };
  }
  return { targetGroupIds: undefined, primaryGroupId: undefined };
}

/** Valida que todos los grupos objetivo pertenezcan a la academia/tenant. */
async function validateTargetGroups(
  targetGroupIds: string[],
  primaryGroupId: string | null,
  tenantId: string,
  academyId: string
): Promise<{ ok: true; primary: PrimaryGroupRow | null } | { ok: false }> {
  let primary: PrimaryGroupRow | null = null;
  for (const gid of targetGroupIds) {
    const [row] = await db
      .select({
        id: groups.id,
        academyId: groups.academyId,
        tenantId: groups.tenantId,
        sportConfigId: groups.sportConfigId,
        programCode: groups.programCode,
        levelCode: groups.levelCode,
        categoryCode: groups.categoryCode,
      })
      .from(groups)
      .where(eq(groups.id, gid))
      .limit(1);

    if (!row || row.tenantId !== tenantId || row.academyId !== academyId) {
      return { ok: false };
    }
    if (gid === primaryGroupId) {
      primary = {
        id: row.id,
        sportConfigId: row.sportConfigId,
        programCode: row.programCode,
        levelCode: row.levelCode,
        categoryCode: row.categoryCode,
      };
    }
  }
  return { ok: true, primary };
}

/**
 * Reconcilia group_athletes para que refleje exactamente el conjunto objetivo:
 * elimina las pertenencias que ya no están e inserta las nuevas, preservando la
 * fila (y su custom_fee_cents) de los grupos que se mantienen.
 */
async function reconcileAthleteGroups(athleteId: string, tenantId: string, targetGroupIds: string[]) {
  if (targetGroupIds.length === 0) {
    await db.delete(groupAthletes).where(eq(groupAthletes.athleteId, athleteId));
    return;
  }

  await db
    .delete(groupAthletes)
    .where(and(eq(groupAthletes.athleteId, athleteId), notInArray(groupAthletes.groupId, targetGroupIds)));

  await db
    .insert(groupAthletes)
    .values(
      targetGroupIds.map((gid) => ({
        id: randomUUID(),
        tenantId,
        groupId: gid,
        athleteId,
      }))
    )
    .onConflictDoNothing();
}

async function validateSportAssignment(params: {
  academyId: string;
  tenantId: string;
  sportConfigId: string | null;
  programCode: string | null;
  levelCode: string | null;
  categoryCode: string | null;
}) {
  if (!params.sportConfigId) return null;

  const verifiedConfig = await verifyAcademySportConfig({
    academyId: params.academyId,
    tenantId: params.tenantId,
    sportConfigId: params.sportConfigId,
  });

  if (!verifiedConfig) {
    return apiError("SPORT_CONFIG_NOT_FOUND", "La configuración deportiva no está activa en esta academia", 400);
  }

  const activeConfigs = await getAcademySportConfigOptions(params.academyId);
  const selectedConfig = activeConfigs.find((config) => config.id === params.sportConfigId);

  if (!selectedConfig) {
    return apiError("SPORT_CONFIG_NOT_FOUND", "La configuración deportiva no está disponible", 400);
  }

  if (!isProgramCodeAllowed(selectedConfig, params.programCode)) {
    return apiError("INVALID_PROGRAM", "El programa no pertenece a la configuración deportiva seleccionada", 400);
  }

  if (!isLevelCodeAllowed(selectedConfig, params.levelCode, params.programCode)) {
    return apiError("INVALID_LEVEL", "El nivel no pertenece a la configuración deportiva seleccionada", 400);
  }

  if (!isCategoryCodeAllowed(selectedConfig, params.categoryCode)) {
    return apiError("INVALID_CATEGORY", "La categoría no pertenece a la configuración deportiva seleccionada", 400);
  }

  return null;
}

async function upsertAthleteSportConfig(params: {
  tenantId: string;
  athleteId: string;
  sportConfigId: string | null;
  programCode: string | null;
  levelCode: string | null;
  categoryCode: string | null;
}) {
  if (!params.sportConfigId) return;

  await db
    .insert(athleteSportConfigs)
    .values({
      id: randomUUID(),
      tenantId: params.tenantId,
      athleteId: params.athleteId,
      academySportConfigId: params.sportConfigId,
      programCode: params.programCode,
      levelCode: params.levelCode,
      categoryCode: params.categoryCode,
    })
    .onConflictDoUpdate({
      target: [athleteSportConfigs.athleteId, athleteSportConfigs.academySportConfigId],
      set: {
        programCode: params.programCode,
        levelCode: params.levelCode,
        categoryCode: params.categoryCode,
      },
    });
}

// Handler for GET - rate limited: 100 requests per minute
const getAthleteHandler = withTenant(async (_request, context) => {
  const athleteId = (context.params as { athleteId?: string })?.athleteId;

  if (!athleteId) {
    return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
  }

  const { tenantId } = context;

  const [athlete] = await db
    .select()
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, tenantId)))
    .limit(1);

  if (!athlete) {
    return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
  }

  // Pertenencias multi-grupo (fuente de verdad). El grupo principal va primero.
  const memberships = await db
    .select({ groupId: groupAthletes.groupId })
    .from(groupAthletes)
    .where(eq(groupAthletes.athleteId, athleteId));

  const groupIdSet = new Set<string>();
  if (athlete.groupId) groupIdSet.add(athlete.groupId);
  memberships.forEach((m) => groupIdSet.add(m.groupId));

  return apiSuccess({ ...athlete, groupIds: Array.from(groupIdSet) });
});

export const GET = withRateLimit(
  async (request, context) => {
    return (await getAthleteHandler(request, context)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 100, window: 60 }
);

// Handler for PUT - rate limited: 30 requests per minute
const updateAthleteHandler = withTenant(async (request, context) => {
  const athleteId = (context.params as { athleteId?: string })?.athleteId;

  if (!athleteId) {
    return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
  }

  const { tenantId } = context;

  // Verify the athlete belongs to the tenant
  const [existing] = await db
    .select()
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
  }

  const body = UpdateSchema.parse(await request.json());

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    updates.name = body.name;
  }
  if (body.dob !== undefined) {
    if (body.dob === null) {
      updates.dob = null;
    } else if (body.dob === "INVALID") {
      return apiError("INVALID_DOB", "El formato de fecha de nacimiento no es válido", 400);
    } else if (body.dob instanceof Date) {
      updates.dob = formatDateForDB(body.dob);
    }
  }
  if (body.level !== undefined) {
    updates.level = body.level;
  }
  if (body.status !== undefined) {
    updates.status = body.status;
  }

  const { targetGroupIds, primaryGroupId } = resolveGroupTarget(body);
  let selectedGroup: PrimaryGroupRow | null = null;

  if (targetGroupIds !== undefined) {
    const validation = await validateTargetGroups(
      targetGroupIds,
      primaryGroupId ?? null,
      existing.tenantId,
      existing.academyId
    );
    if (!validation.ok) {
      return apiError("GROUP_NOT_FOUND", "Group not found", 404);
    }
    selectedGroup = validation.primary;
    updates.groupId = primaryGroupId ?? null;
  }

  const nextSportConfigId =
    body.primarySportConfigId !== undefined
      ? body.primarySportConfigId
      : selectedGroup?.sportConfigId ?? existing.primarySportConfigId ?? null;
  const nextProgramCode =
    body.programCode !== undefined ? body.programCode : selectedGroup?.programCode ?? existing.programCode ?? null;
  const nextLevelCode =
    body.levelCode !== undefined ? body.levelCode : selectedGroup?.levelCode ?? existing.levelCode ?? null;
  const nextCategoryCode =
    body.categoryCode !== undefined ? body.categoryCode : selectedGroup?.categoryCode ?? existing.categoryCode ?? null;

  if (
    body.primarySportConfigId !== undefined ||
    body.programCode !== undefined ||
    body.levelCode !== undefined ||
    body.categoryCode !== undefined ||
    selectedGroup
  ) {
    const validationError = await validateSportAssignment({
      academyId: existing.academyId,
      tenantId: existing.tenantId,
      sportConfigId: nextSportConfigId,
      programCode: nextProgramCode,
      levelCode: nextLevelCode,
      categoryCode: nextCategoryCode,
    });

    if (validationError) return validationError;

    updates.primarySportConfigId = nextSportConfigId;
    updates.programCode = nextProgramCode;
    updates.levelCode = nextLevelCode;
    updates.categoryCode = nextCategoryCode;
  }
  if (body.age !== undefined) {
    updates.age = body.age;
  }

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(athletes)
    .set(updates)
    .where(eq(athletes.id, athleteId))
    .returning();

  if (targetGroupIds !== undefined) {
    await reconcileAthleteGroups(athleteId, existing.tenantId, targetGroupIds);
    if (primaryGroupId) {
      await syncChargesForAthleteCurrentPeriod({
        academyId: existing.academyId,
        athleteId,
        groupId: primaryGroupId,
      });
    }
  }

  await upsertAthleteSportConfig({
    tenantId: existing.tenantId,
    athleteId,
    sportConfigId: nextSportConfigId,
    programCode: nextProgramCode,
    levelCode: nextLevelCode,
    categoryCode: nextCategoryCode,
  });

  return apiSuccess(updated);
});

export const PUT = withRateLimit(
  async (request, context) => {
    return (await updateAthleteHandler(request, context)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 30, window: 60 }
);

// Handler for PATCH - rate limited: 30 requests per minute
const patchAthleteHandler = withTenant(async (request, context) => {
  const athleteId = (context.params as { athleteId?: string })?.athleteId;

  if (!athleteId) {
    return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
  }

  const athleteRow = await getAthleteTenant(athleteId);

  if (!athleteRow) {
    return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
  }

  if (
    context.profile.role !== "super_admin" &&
    athleteRow.tenantId !== context.tenantId
  ) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  const body = UpdateSchema.parse(await request.json());

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    updates.name = body.name;
  }
  if (body.dob !== undefined) {
    if (body.dob === null) {
      updates.dob = null;
    } else if (body.dob === "INVALID") {
      return apiError("INVALID_DOB", "El formato de fecha de nacimiento no es válido. Use formato YYYY-MM-DD o ISO 8601", 400);
    } else if (body.dob instanceof Date) {
      const year = body.dob.getFullYear();
      if (year < 1900 || year > 2100) {
        return apiError("INVALID_DOB", "El año de nacimiento debe estar entre 1900 y 2100", 400);
      }
      updates.dob = body.dob instanceof Date ? formatDateForDB(body.dob) : null;
    }
  }
  if (body.level !== undefined) {
    updates.level = body.level ?? null;
  }
  const { targetGroupIds, primaryGroupId } = resolveGroupTarget(body);
  let selectedGroup: PrimaryGroupRow | null = null;

  if (targetGroupIds !== undefined) {
    const validation = await validateTargetGroups(
      targetGroupIds,
      primaryGroupId ?? null,
      athleteRow.tenantId,
      athleteRow.academyId
    );
    if (!validation.ok) {
      return apiError("GROUP_NOT_FOUND", "Group not found", 404);
    }
    selectedGroup = validation.primary;
    updates.groupId = primaryGroupId ?? null;
  }

  if (body.status !== undefined) {
    updates.status = body.status;
  }

  const nextSportConfigId =
    body.primarySportConfigId !== undefined
      ? body.primarySportConfigId
      : selectedGroup?.sportConfigId ?? athleteRow.primarySportConfigId ?? null;
  const nextProgramCode =
    body.programCode !== undefined ? body.programCode : selectedGroup?.programCode ?? athleteRow.programCode ?? null;
  const nextLevelCode =
    body.levelCode !== undefined ? body.levelCode : selectedGroup?.levelCode ?? athleteRow.levelCode ?? null;
  const nextCategoryCode =
    body.categoryCode !== undefined ? body.categoryCode : selectedGroup?.categoryCode ?? athleteRow.categoryCode ?? null;

  if (
    body.primarySportConfigId !== undefined ||
    body.programCode !== undefined ||
    body.levelCode !== undefined ||
    body.categoryCode !== undefined ||
    selectedGroup
  ) {
    const validationError = await validateSportAssignment({
      academyId: athleteRow.academyId,
      tenantId: athleteRow.tenantId,
      sportConfigId: nextSportConfigId,
      programCode: nextProgramCode,
      levelCode: nextLevelCode,
      categoryCode: nextCategoryCode,
    });

    if (validationError) return validationError;

    updates.primarySportConfigId = nextSportConfigId;
    updates.programCode = nextProgramCode;
    updates.levelCode = nextLevelCode;
    updates.categoryCode = nextCategoryCode;
  }

  if (Object.keys(updates).length === 0) {
    return apiSuccess({ ok: true });
  }

  await db.update(athletes).set(updates).where(eq(athletes.id, athleteId));

  if (targetGroupIds !== undefined) {
    // group_athletes es la fuente de verdad de pertenencia (multi-grupo). Se
    // reconcilia al conjunto objetivo, preservando el custom_fee_cents de los
    // grupos que se mantienen.
    await reconcileAthleteGroups(athleteId, athleteRow.tenantId, targetGroupIds);
    if (primaryGroupId) {
      await syncChargesForAthleteCurrentPeriod({
        academyId: athleteRow.academyId,
        athleteId,
        groupId: primaryGroupId,
      });
    }
  }

  await upsertAthleteSportConfig({
    tenantId: athleteRow.tenantId,
    athleteId,
    sportConfigId: nextSportConfigId,
    programCode: nextProgramCode,
    levelCode: nextLevelCode,
    categoryCode: nextCategoryCode,
  });

  return apiSuccess({ ok: true });
});

export const PATCH = withRateLimit(
  async (request, context) => {
    return (await patchAthleteHandler(request, context)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 30, window: 60 }
);

// Handler for DELETE - rate limited: 5 requests per minute
const deleteAthleteHandler = withTenant(async (_request, context) => {
  const athleteId = (context.params as { athleteId?: string })?.athleteId;

  if (!athleteId) {
    return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
  }

  const athleteRow = await getAthleteTenant(athleteId);

  if (!athleteRow) {
    return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
  }

  if (
    context.profile.role !== "super_admin" &&
    athleteRow.tenantId !== context.tenantId
  ) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  await db.delete(athletes).where(eq(athletes.id, athleteId));

  return apiSuccess({ ok: true });
});

export const DELETE = withRateLimit(
  async (request, context) => {
    return (await deleteAthleteHandler(request, context)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 5, window: 60 }
);
