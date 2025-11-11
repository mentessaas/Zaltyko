import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  classCoachAssignments,
  classes,
  coaches,
} from "@/db/schema";
import { withTenant } from "@/lib/authz";

const updateSchema = z.object({
  classIds: z.array(z.string().uuid()),
});

export const GET = withTenant(async (_request, context) => {
  const coachId = context.params?.coachId;

  if (!coachId) {
    return NextResponse.json({ error: "COACH_ID_REQUIRED" }, { status: 400 });
  }

  const assignmentRows = await db
    .select({
      classId: classCoachAssignments.classId,
      className: classes.name,
      academyId: classes.academyId,
    })
    .from(classCoachAssignments)
    .innerJoin(classes, eq(classCoachAssignments.classId, classes.id))
    .where(eq(classCoachAssignments.coachId, coachId));

  return NextResponse.json({ items: assignmentRows });
});

export const PUT = withTenant(async (request, context) => {
  const coachId = context.params?.coachId;

  if (!coachId) {
    return NextResponse.json({ error: "COACH_ID_REQUIRED" }, { status: 400 });
  }

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const body = updateSchema.parse(await request.json());

  const [coachRow] = await db
    .select({ tenantId: coaches.tenantId })
    .from(coaches)
    .where(eq(coaches.id, coachId))
    .limit(1);

  if (!coachRow || coachRow.tenantId !== context.tenantId) {
    return NextResponse.json({ error: "COACH_NOT_FOUND" }, { status: 404 });
  }

  await db
    .delete(classCoachAssignments)
    .where(eq(classCoachAssignments.coachId, coachId));

  if (body.classIds.length > 0) {
    const records = Array.from(new Set(body.classIds)).map((classId) => ({
      id: crypto.randomUUID(),
      tenantId: context.tenantId!,
      classId,
      coachId,
    }));

    await db.insert(classCoachAssignments).values(records);
  }

  return NextResponse.json({ ok: true });
});


