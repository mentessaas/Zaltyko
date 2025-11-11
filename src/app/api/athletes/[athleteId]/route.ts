import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, groupAthletes, groups } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { athleteStatusOptions } from "@/lib/athletes/constants";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  dob: z
    .union([z.string().datetime(), z.string().length(10), z.literal(""), z.null()])
    .optional(),
  level: z.string().max(120).nullable().optional(),
  status: z.enum(athleteStatusOptions).optional(),
  groupId: z.string().uuid().nullable().optional(),
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

export const PATCH = withTenant(async (request, context) => {
  const athleteId = context.params?.athleteId;

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
    if (!body.dob) {
      updates.dob = null;
    } else {
      const parsed = new Date(body.dob);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "INVALID_DOB" }, { status: 400 });
      }
      updates.dob = parsed;
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
    } else {
      await db.delete(groupAthletes).where(eq(groupAthletes.athleteId, athleteId));
    }
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = withTenant(async (_request, context) => {
  const athleteId = context.params?.athleteId;

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


