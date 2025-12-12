import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { attendanceRecords, classSessions } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";

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
  try {
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

    // Usar transacción para garantizar atomicidad
    await withTransaction(async (tx) => {
      for (const entry of body.entries) {
        const status = entry.status ?? "present";
        const notes = entry.notes ?? null;

        await tx
          .insert(attendanceRecords)
          .values({
            id: crypto.randomUUID(),
            tenantId: context.tenantId,
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
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});

const querySchema = z.object({
  sessionId: z.string().uuid().optional(),
  academyId: z.string().uuid().optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const params = querySchema.safeParse(search);

    if (!params.success) {
      return handleApiError(params.error);
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    if (!params.data.sessionId && !params.data.academyId) {
      return NextResponse.json({ error: "SESSION_OR_ACADEMY_REQUIRED" }, { status: 400 });
    }

    const whereConditions = [eq(attendanceRecords.tenantId, context.tenantId)];

    if (params.data.sessionId) {
      whereConditions.push(eq(attendanceRecords.sessionId, params.data.sessionId));
    } else if (params.data.academyId) {
      whereConditions.push(eq(classSessions.classId, params.data.academyId));
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
  } catch (error) {
    return handleApiError(error);
  }
});
