import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { classSessions, classes } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  classId: z.string().uuid(),
  sessionDate: z.string().min(1),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  coachId: z.string().uuid().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withTenant(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const [classRow] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, body.classId), eq(classes.tenantId, context.tenantId)))
    .limit(1);

  if (!classRow) {
    return NextResponse.json({ error: "CLASS_NOT_FOUND" }, { status: 404 });
  }

  const sessionId = crypto.randomUUID();

  await db.insert(classSessions).values({
    id: sessionId,
    tenantId: context.tenantId,
    classId: body.classId,
    coachId: body.coachId ?? null,
    sessionDate: body.sessionDate,
    startTime: body.startTime ?? null,
    endTime: body.endTime ?? null,
    status: body.status ?? "scheduled",
    notes: body.notes ?? null,
  });

  return NextResponse.json({ ok: true, id: sessionId });
});
