import { apiSuccess, apiError } from "@/lib/api-response";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { classSessions, classes } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const updateSchema = z.object({
  sessionDate: z.string().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  coachId: z.string().uuid().nullable().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
});

export const GET = withTenant(async (_request, context) => {
  const params = context.params as { sessionId?: string };
  const sessionId = params?.sessionId;

  if (!sessionId) {
    return apiError("SESSION_ID_REQUIRED", "Session ID is required", 400);
  }

  const [sessionRow] = await db
    .select()
    .from(classSessions)
    .where(eq(classSessions.id, sessionId))
    .limit(1);

  if (!sessionRow) {
    return apiError("SESSION_NOT_FOUND", "Session not found", 404);
  }

  return apiSuccess({ item: sessionRow });
});

export const PUT = withTenant(async (request, context) => {
  const params = context.params as { sessionId?: string };
  const sessionId = params?.sessionId;

  if (!sessionId) {
    return apiError("SESSION_ID_REQUIRED", "Session ID is required", 400);
  }

  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const body = updateSchema.parse(await request.json());

  const [sessionRow] = await db
    .select({
      id: classSessions.id,
      classId: classSessions.classId,
    })
    .from(classSessions)
    .where(and(eq(classSessions.id, sessionId), eq(classSessions.tenantId, context.tenantId)))
    .limit(1);

  if (!sessionRow) {
    return apiError("SESSION_NOT_FOUND", "Session not found", 404);
  }

  if (body.coachId) {
    const [classRow] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.id, sessionRow.classId), eq(classes.tenantId, context.tenantId)))
      .limit(1);

    if (!classRow) {
      return apiError("CLASS_NOT_FOUND", "Class not found", 404);
    }
  }

  const updates: Record<string, unknown> = {};

  if (body.sessionDate !== undefined) updates.sessionDate = body.sessionDate;
  if (body.startTime !== undefined) updates.startTime = body.startTime;
  if (body.endTime !== undefined) updates.endTime = body.endTime;
  if (body.coachId !== undefined) updates.coachId = body.coachId;
  if (body.status !== undefined) updates.status = body.status;
  if (body.notes !== undefined) updates.notes = body.notes;

  if (Object.keys(updates).length > 0) {
    await db
      .update(classSessions)
      .set(updates)
      .where(eq(classSessions.id, sessionId));
  }

  return apiSuccess({ ok: true });
});


