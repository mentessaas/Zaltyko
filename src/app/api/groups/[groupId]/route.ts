import { NextResponse } from "next/server";
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
import { withTenant } from "@/lib/authz";

type Params = {
  params: {
    groupId: string;
  };
};

const DISCIPLINES = ["artistica", "ritmica", "trampolin", "general"] as const;

const GroupUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  discipline: z.enum(DISCIPLINES).optional(),
  level: z.string().max(120).optional().nullable(),
  coachId: z.string().uuid().nullable().optional(),
  assistantIds: z.array(z.string().uuid()).optional(),
  athleteIds: z.array(z.string().uuid()).optional(),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}){1,2}$/)
    .nullable()
    .optional(),
});

export const PATCH = withTenant(async (request, context: any, { params }: Params) => {
  const { groupId } = params;
  if (!groupId) {
    return NextResponse.json({ error: "GROUP_ID_REQUIRED" }, { status: 400 });
  }

  const [group] = await db
    .select({
      id: groups.id,
      tenantId: groups.tenantId,
      academyId: groups.academyId,
      coachId: groups.coachId,
      assistantIds: groups.assistantIds,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) {
    return NextResponse.json({ error: "GROUP_NOT_FOUND" }, { status: 404 });
  }

  const role = context.profile.role;
  const isElevated = role === "super_admin" || role === "admin" || role === "owner";

  if (!isElevated) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (role !== "super_admin" && group.tenantId !== context.tenantId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const payload = GroupUpdateSchema.parse(await request.json());

  if (payload.coachId) {
    const [coachRow] = await db
      .select({ id: coaches.id })
      .from(coaches)
      .where(and(eq(coaches.id, payload.coachId), eq(coaches.academyId, group.academyId)))
      .limit(1);

    if (!coachRow) {
      return NextResponse.json({ error: "COACH_NOT_FOUND" }, { status: 404 });
    }
  }

  const assistantIds = payload.assistantIds ? Array.from(new Set(payload.assistantIds)) : undefined;
  if (assistantIds && assistantIds.length) {
    const assistantRows = await db
      .select({ id: coaches.id })
      .from(coaches)
      .where(and(eq(coaches.academyId, group.academyId), inArray(coaches.id, assistantIds)));

    if (assistantRows.length !== assistantIds.length) {
      return NextResponse.json({ error: "ASSISTANT_NOT_FOUND" }, { status: 404 });
    }
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
      return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
    }
  }

  await db.transaction(async (tx) => {
    const updatePayload: Record<string, unknown> = {};
    if (payload.name !== undefined) updatePayload.name = payload.name.trim();
    if (payload.discipline !== undefined) updatePayload.discipline = payload.discipline;
    if (payload.level !== undefined) updatePayload.level = payload.level || null;
    if (payload.coachId !== undefined) updatePayload.coachId = payload.coachId || null;
    if (assistantIds !== undefined) {
      updatePayload.assistantIds = assistantIds.length ? assistantIds : null;
    }
    if (payload.color !== undefined) updatePayload.color = payload.color || null;

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

  return NextResponse.json({ ok: true });
});

export const DELETE = withTenant(async (request, context: any, { params }: Params) => {
  const { groupId } = params;
  if (!groupId) {
    return NextResponse.json({ error: "GROUP_ID_REQUIRED" }, { status: 400 });
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
    return NextResponse.json({ error: "GROUP_NOT_FOUND" }, { status: 404 });
  }

  const role = context.profile.role;
  const isElevated = role === "super_admin" || role === "admin" || role === "owner";

  if (!isElevated) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (role !== "super_admin" && group.tenantId !== context.tenantId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(athletes)
      .set({ groupId: null })
      .where(and(eq(athletes.groupId, groupId), eq(athletes.tenantId, group.tenantId)));

    await tx.delete(groupAthletes).where(eq(groupAthletes.groupId, groupId));
    await tx.delete(groups).where(eq(groups.id, groupId));
  });

  return NextResponse.json({ ok: true });
});
