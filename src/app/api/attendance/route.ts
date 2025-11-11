import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { attendanceRecords, classSessions } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const entrySchema = z.object({
  athleteId: z.string().uuid(),
  status: z.enum(["present", "absent", "late", "excused"]).optional(),
  notes: z.string().optional(),
});

const upsertBodySchema = z.object({
  sessionId: z.string().uuid(),
  entries: z.array(entrySchema).min(1),
});

export const POST = withTenant(async (request, context) => {
  const body = upsertBodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const [sessionRow] = await db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(and(eq(classSessions.id, body.sessionId), eq(classSessions.tenantId, context.tenantId)))
    .limit(1);

  if (!sessionRow) {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }

  const now = new Date();

  for (const entry of body.entries) {
    const status = entry.status ?? "present";
    const notes = entry.notes ?? null;

    await db
      .insert(attendanceRecords)
      .values({
        id: crypto.randomUUID(),
        tenantId: context.tenantId!,
        sessionId: body.sessionId,
        athleteId: entry.athleteId,
        status,
        notes,
        recordedAt: now,
      })
      .onConflictDoUpdate({
        target: [attendanceRecords.sessionId, attendanceRecords.athleteId],
        set: {
          status,
          notes,
          recordedAt: now,
        },
      });
  }

  return NextResponse.json({ ok: true });
});

const querySchema = z.object({
  sessionId: z.string().uuid().optional(),
  academyId: z.string().uuid().optional(),
});

export const GET = withTenant(async (request, context) => {
  const search = Object.fromEntries(new URL(request.url).searchParams);
  const params = querySchema.parse(search);

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  if (!params.sessionId && !params.academyId) {
    return NextResponse.json({ error: "SESSION_OR_ACADEMY_REQUIRED" }, { status: 400 });
  }

  const whereConditions = [eq(attendanceRecords.tenantId, context.tenantId)];

  if (params.sessionId) {
    whereConditions.push(eq(attendanceRecords.sessionId, params.sessionId));
  } else if (params.academyId) {
    whereConditions.push(eq(classSessions.classId, params.academyId));
  }

  const rows = await db
    .select({
      id: attendanceRecords.id,
      sessionId: attendanceRecords.sessionId,
      athleteId: attendanceRecords.athleteId,
      status: attendanceRecords.status,
      notes: attendanceRecords.notes,
      recordedAt: attendanceRecords.recordedAt,
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(classSessions.id, attendanceRecords.sessionId))
    .where(and(...whereConditions));

  return NextResponse.json({ items: rows });
});
