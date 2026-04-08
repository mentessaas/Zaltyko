import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, groupAthletes, groups } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { rateLimit, getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import { syncChargesForAthleteCurrentPeriod } from "@/lib/billing/sync-charges";
import { formatDateForDB } from "@/lib/validation/date-utils";
import { apiSuccess, apiError } from "@/lib/api-response";
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
  groupId: z.string().uuid().nullable().optional(),
  age: z.number().int().min(0).optional(),
});

async function getAthleteTenant(athleteId: string) {
  const [row] = await db
    .select({
      id: athletes.id,
      tenantId: athletes.tenantId,
      academyId: athletes.academyId,
    })
    .from(athletes)
    .where(eq(athletes.id, athleteId))
    .limit(1);

  return row ?? null;
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

  return apiSuccess(athlete);
});

export const GET = withRateLimit(
  async (request) => {
    return (await getAthleteHandler(request, {} as any)) as NextResponse;
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
  if (body.groupId !== undefined) {
    updates.groupId = body.groupId;
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

  return apiSuccess(updated);
});

export const PUT = withRateLimit(
  async (request) => {
    return (await updateAthleteHandler(request, {} as any)) as NextResponse;
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
  let nextGroupId: string | null | undefined;

  if (body.groupId !== undefined) {
    if (body.groupId) {
      const [groupRow] = await db
        .select({ id: groups.id, academyId: groups.academyId, tenantId: groups.tenantId })
        .from(groups)
        .where(eq(groups.id, body.groupId))
        .limit(1);

      if (!groupRow || groupRow.tenantId !== athleteRow.tenantId || groupRow.academyId !== athleteRow.academyId) {
        return apiError("GROUP_NOT_FOUND", "Group not found", 404);
      }
      nextGroupId = groupRow.id;
    } else {
      nextGroupId = null;
    }
    updates.groupId = nextGroupId;
  }

  if (body.status !== undefined) {
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return apiSuccess({ ok: true });
  }

  await db.update(athletes).set(updates).where(eq(athletes.id, athleteId));

  if (body.groupId !== undefined) {
    if (nextGroupId) {
      await db
        .insert(groupAthletes)
        .values({
          id: randomUUID(),
          tenantId: athleteRow.tenantId,
          groupId: nextGroupId,
          athleteId,
        })
        .onConflictDoNothing();

      await syncChargesForAthleteCurrentPeriod({
        academyId: athleteRow.academyId,
        athleteId,
        groupId: nextGroupId,
      });
    } else {
      await db.delete(groupAthletes).where(eq(groupAthletes.athleteId, athleteId));
    }
  }

  return apiSuccess({ ok: true });
});

export const PATCH = withRateLimit(
  async (request) => {
    return (await patchAthleteHandler(request, {} as any)) as NextResponse;
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
  async (request) => {
    return (await deleteAthleteHandler(request, {} as any)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 5, window: 60 }
);


