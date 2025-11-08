import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { attendanceRecords, classSessions } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const EntrySchema = z.object({
  athleteId: z.string().uuid(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

const BodySchema = z.object({
  academyId: z.string().uuid(),
  sessionId: z.string().uuid(),
  entries: z.array(EntrySchema).min(1),
});

export const POST = withTenant(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const [sessionRow] = await db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.id, body.sessionId),
        eq(classSessions.tenantId, context.tenantId)
      )
    )
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
