import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { classCoachAssignments, coaches } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
});

async function getCoach(coachId: string) {
  const [row] = await db
    .select({
      id: coaches.id,
      tenantId: coaches.tenantId,
    })
    .from(coaches)
    .where(eq(coaches.id, coachId))
    .limit(1);

  return row ?? null;
}

export const PATCH = withTenant(async (request, context) => {
  const coachId = context.params?.coachId;

  if (!coachId) {
    return NextResponse.json({ error: "COACH_ID_REQUIRED" }, { status: 400 });
  }

  const coach = await getCoach(coachId);

  if (!coach) {
    return NextResponse.json({ error: "COACH_NOT_FOUND" }, { status: 404 });
  }

  if (
    context.profile.role !== "super_admin" &&
    coach.tenantId !== context.tenantId
  ) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = UpdateSchema.parse(await request.json());

  if (Object.keys(body).length === 0) {
    return NextResponse.json({ ok: true });
  }

  await db
    .update(coaches)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.email !== undefined ? { email: body.email ?? null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
    })
    .where(eq(coaches.id, coachId));

  return NextResponse.json({ ok: true });
});

export const DELETE = withTenant(async (_request, context) => {
  const coachId = context.params?.coachId;

  if (!coachId) {
    return NextResponse.json({ error: "COACH_ID_REQUIRED" }, { status: 400 });
  }

  const coach = await getCoach(coachId);

  if (!coach) {
    return NextResponse.json({ error: "COACH_NOT_FOUND" }, { status: 404 });
  }

  if (
    context.profile.role !== "super_admin" &&
    coach.tenantId !== context.tenantId
  ) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  await db.delete(classCoachAssignments).where(eq(classCoachAssignments.coachId, coachId));
  await db.delete(coaches).where(eq(coaches.id, coachId));

  return NextResponse.json({ ok: true });
});


