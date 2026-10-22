export const dynamic = 'force-dynamic';

import { apiSuccess, apiError } from "@/lib/api-response";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, classSessions, classes, coaches } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const bodySchema = z.object({
  academyId: z.string().uuid(),
  classId: z.string().uuid(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD requerida"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, "Hora HH:mm inválida").optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, "Hora HH:mm inválida").optional(),
  coachId: z.string().uuid().optional(),
  status: z.string().optional(),
  notes: z.string().max(2000).optional(),
}).superRefine((value, ctx) => {
  if (value.startTime && value.endTime && value.startTime >= value.endTime) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "La hora de fin debe ser posterior al inicio" });
  }
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
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  if (!params.success) {
    return apiError("INVALID_FILTERS", "Invalid filters", 400);
  }

  const { classId, academyId, coachId, from, to } = params.data;

  const whereConditions = [
    eq(classSessions.tenantId, context.tenantId),
    eq(classes.tenantId, context.tenantId),
    eq(academies.tenantId, context.tenantId),
  ];

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
      sportConfigId: classSessions.sportConfigId,
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
    .orderBy(asc(classSessions.sessionDate), asc(classSessions.startTime))
    .limit(5000);

  return apiSuccess({ items: rows });
});

export const POST = withTenant(async (request, context) => {
  const body = bodySchema.parse(await request.json());

  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const [classRow] = await db
    .select({ id: classes.id, academyId: classes.academyId, sportConfigId: classes.sportConfigId })
    .from(classes)
    .where(and(eq(classes.id, body.classId), eq(classes.tenantId, context.tenantId)))
    .limit(1);

  if (!classRow) {
    return apiError("CLASS_NOT_FOUND", "Class not found", 404);
  }

  if (body.coachId) {
    const [coach] = await db
      .select({ id: coaches.id })
      .from(coaches)
      .where(and(
        eq(coaches.id, body.coachId),
        eq(coaches.tenantId, context.tenantId),
        eq(coaches.academyId, classRow.academyId),
      ))
      .limit(1);
    if (!coach) return apiError("COACH_NOT_FOUND", "Coach not found", 404);
  }

  const sessionId = crypto.randomUUID();

  const [createdSession] = await db.insert(classSessions).values({
    id: sessionId,
    tenantId: context.tenantId,
    classId: body.classId,
    sportConfigId: classRow.sportConfigId,
    coachId: body.coachId ?? null,
    sessionDate: body.sessionDate,
    startTime: body.startTime ?? null,
    endTime: body.endTime ?? null,
    status: body.status ?? "scheduled",
    notes: body.notes ?? null,
  }).onConflictDoNothing({ target: [classSessions.classId, classSessions.sessionDate] }).returning({ id: classSessions.id });

  if (!createdSession) {
    const [existingSession] = await db
      .select({ id: classSessions.id })
      .from(classSessions)
      .where(and(eq(classSessions.classId, body.classId), eq(classSessions.sessionDate, body.sessionDate)))
      .limit(1);
    return apiSuccess({ ok: true, id: existingSession?.id ?? null, created: false });
  }

  return apiSuccess({ ok: true, id: createdSession.id, created: true });
});
