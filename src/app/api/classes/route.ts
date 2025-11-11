import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, classCoachAssignments, classes, coaches } from "@/db/schema";
import { assertWithinPlanLimits } from "@/lib/limits";
import { withTenant } from "@/lib/authz";

const bodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  weekday: z.number().int().min(0).max(6).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  capacity: z.number().int().positive().optional(),
});

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
  includeAssignments: z
    .string()
    .transform((value) => value === "true" || value === "1")
    .optional(),
});

export const GET = withTenant(async (request, context) => {
  const url = new URL(request.url);
  const params = querySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  if (!params.success) {
    return NextResponse.json({ error: "INVALID_FILTERS" }, { status: 400 });
  }

  const { academyId, includeAssignments } = params.data;

  const classRows = await db
    .select({
      id: classes.id,
      name: classes.name,
      academyId: classes.academyId,
      academyName: academies.name,
      weekday: classes.weekday,
      startTime: classes.startTime,
      endTime: classes.endTime,
      capacity: classes.capacity,
      createdAt: classes.createdAt,
    })
    .from(classes)
    .innerJoin(academies, eq(classes.academyId, academies.id))
    .where(academyId ? eq(classes.academyId, academyId) : eq(classes.tenantId, context.tenantId))
    .orderBy(asc(classes.name));

  if (!includeAssignments) {
    return NextResponse.json({ items: classRows });
  }

  const assignments = await db
    .select({
      classId: classCoachAssignments.classId,
      coachId: classCoachAssignments.coachId,
      coachName: coaches.name,
      coachEmail: coaches.email,
    })
    .from(classCoachAssignments)
    .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
    .where(eq(classCoachAssignments.tenantId, context.tenantId));

  const grouped = classRows.map((row) => ({
    ...row,
    coaches: assignments
      .filter((assignment) => assignment.classId === row.id)
      .map((assignment) => ({
        id: assignment.coachId,
        name: assignment.coachName,
        email: assignment.coachEmail,
      })),
  }));

  return NextResponse.json({ items: grouped });
});

export const POST = withTenant(async (request, context) => {
  const body = bodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  await assertWithinPlanLimits(context.tenantId, body.academyId, "classes");

  await db.insert(classes).values({
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    academyId: body.academyId,
    name: body.name,
    weekday: body.weekday ?? null,
    startTime: body.startTime ?? null,
    endTime: body.endTime ?? null,
    capacity: body.capacity ?? null,
  });

  return NextResponse.json({ ok: true });
});
