import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, groupAthletes, groups } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import { syncChargesForAthleteCurrentPeriod } from "@/lib/billing/sync-charges";
import { formatDateForDB } from "@/lib/validation/date-utils";

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

export const GET = withTenant(async (_request, context) => {
  const athleteId = (context.params as { athleteId?: string })?.athleteId;

  if (!athleteId) {
    return NextResponse.json({ error: "ATHLETE_ID_REQUIRED" }, { status: 400 });
  }

  const { tenantId } = context;

  const [athlete] = await db
    .select()
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, tenantId)))
    .limit(1);

  if (!athlete) {
    return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(athlete);
});

export const PUT = withTenant(async (request, context) => {
  const athleteId = (context.params as { athleteId?: string })?.athleteId;

  if (!athleteId) {
    return NextResponse.json({ error: "ATHLETE_ID_REQUIRED" }, { status: 400 });
  }

  const { tenantId } = context;

  // Verify the athlete belongs to the tenant
  const [existing] = await db
    .select()
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
  }

  const body = await request.json();

  const [updated] = await db
    .update(athletes)
    .set({
      ...body,
      updatedAt: new Date(),
    })
    .where(eq(athletes.id, athleteId))
    .returning();

  return NextResponse.json(updated);
});

export const PATCH = withTenant(async (request, context) => {
  const athleteId = (context.params as { athleteId?: string })?.athleteId;

  if (!athleteId) {
    return NextResponse.json({ error: "ATHLETE_ID_REQUIRED" }, { status: 400 });
  }

  const athleteRow = await getAthleteTenant(athleteId);

  if (!athleteRow) {
    return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
  }

  if (
    context.profile.role !== "super_admin" &&
    athleteRow.tenantId !== context.tenantId
  ) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
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
      // El transform marcó la fecha como inválida
      return NextResponse.json(
        { error: "INVALID_DOB", message: "El formato de fecha de nacimiento no es válido. Use formato YYYY-MM-DD o ISO 8601" },
        { status: 400 }
      );
    } else if (body.dob instanceof Date) {
      // Validar que la fecha sea razonable
      const year = body.dob.getFullYear();
      if (year < 1900 || year > 2100) {
        return NextResponse.json(
          { error: "INVALID_DOB", message: "El año de nacimiento debe estar entre 1900 y 2100" },
          { status: 400 }
        );
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
        return NextResponse.json({ error: "GROUP_NOT_FOUND" }, { status: 404 });
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
    return NextResponse.json({ ok: true });
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
      
      // Sincronizar cargos pendientes del periodo actual con la nueva cuota del grupo
      await syncChargesForAthleteCurrentPeriod({
        academyId: athleteRow.academyId,
        athleteId,
        groupId: nextGroupId,
      });
    } else {
      await db.delete(groupAthletes).where(eq(groupAthletes.athleteId, athleteId));
    }
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = withTenant(async (_request, context) => {
  const athleteId = (context.params as { athleteId?: string })?.athleteId;

  if (!athleteId) {
    return NextResponse.json({ error: "ATHLETE_ID_REQUIRED" }, { status: 400 });
  }

  const athleteRow = await getAthleteTenant(athleteId);

  if (!athleteRow) {
    return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
  }

  if (
    context.profile.role !== "super_admin" &&
    athleteRow.tenantId !== context.tenantId
  ) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  await db.delete(athletes).where(eq(athletes.id, athleteId));

  return NextResponse.json({ ok: true });
});


