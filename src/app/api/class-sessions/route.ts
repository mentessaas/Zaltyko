import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, classSessions, classes, coaches } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const bodySchema = z.object({
  academyId: z.string().uuid(),
  classId: z.string().uuid(),
  sessionDate: z.string().min(1),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  coachId: z.string().uuid().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

const querySchema = z.object({
  classId: z.string().uuid().optional(),
  academyId: z.string().uuid().optional(),
  coachId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
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

  const { classId, academyId, coachId, from, to } = params.data;

  const whereConditions = [eq(classSessions.tenantId, context.tenantId)];

  if (classId) {
    whereConditions.push(eq(classSessions.classId, classId));
  }

  if (coachId) {
    whereConditions.push(eq(classSessions.coachId, coachId));
  }

  if (from) {
    whereConditions.push(gte(classSessions.sessionDate, from));
  }

  if (to) {
    whereConditions.push(lte(classSessions.sessionDate, to));
  }

  if (academyId) {
    whereConditions.push(eq(classes.academyId, academyId));
  }

  const whereClause = whereConditions.length === 1 ? whereConditions[0]! : and(...whereConditions);

  const rows = await db
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: classSessions.status,
      notes: classSessions.notes,
      classId: classes.id,
      className: classes.name,
      academyId: classes.academyId,
      academyName: academies.name,
      coachId: classSessions.coachId,
      coachName: coaches.name,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .innerJoin(academies, eq(classes.academyId, academies.id))
    .leftJoin(coaches, eq(classSessions.coachId, coaches.id))
    .where(whereClause)
    .orderBy(asc(classSessions.sessionDate), asc(classSessions.startTime));

  return NextResponse.json({ items: rows });
});

export const POST = withTenant(async (request, context) => {
  const body = bodySchema.parse(await request.json());

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
