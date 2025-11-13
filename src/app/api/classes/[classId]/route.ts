import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  classCoachAssignments,
  classes,
  coaches,
} from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { verifyClassAccess } from "@/lib/permissions";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  coachIds: z.array(z.string().uuid()).optional(),
});

export const GET = withTenant(async (_request, context) => {
  const classId = context.params?.classId;

  if (!classId) {
    return NextResponse.json({ error: "CLASS_ID_REQUIRED" }, { status: 400 });
  }

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const [classRow] = await db
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
    .where(eq(classes.id, classId))
    .limit(1);

  if (!classRow) {
    return NextResponse.json({ error: "CLASS_NOT_FOUND" }, { status: 404 });
  }

  const assignments = await db
    .select({
      coachId: classCoachAssignments.coachId,
      coachName: coaches.name,
      coachEmail: coaches.email,
    })
    .from(classCoachAssignments)
    .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
    .where(eq(classCoachAssignments.classId, classId))
    .orderBy(asc(coaches.name));

  return NextResponse.json({
    item: {
      ...classRow,
      coaches: assignments,
    },
  });
});

export const PUT = withTenant(async (request, context) => {
  try {
    const classId = context.params?.classId;

    if (!classId) {
      return NextResponse.json({ error: "CLASS_ID_REQUIRED" }, { status: 400 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const body = updateSchema.parse(await request.json());

    // Verificar acceso a la clase
    const classAccess = await verifyClassAccess(classId, context.tenantId);
    if (!classAccess.allowed) {
      return NextResponse.json({ error: classAccess.reason ?? "CLASS_NOT_FOUND" }, { status: 404 });
    }

    // Usar transacción para garantizar atomicidad
    await withTransaction(async (tx) => {
      const updates: Record<string, unknown> = {};

      if (body.name !== undefined) updates.name = body.name;
      if (body.weekday !== undefined) updates.weekday = body.weekday;
      if (body.startTime !== undefined) updates.startTime = body.startTime;
      if (body.endTime !== undefined) updates.endTime = body.endTime;
      if (body.capacity !== undefined) updates.capacity = body.capacity;

      if (Object.keys(updates).length > 0) {
        await tx
          .update(classes)
          .set(updates)
          .where(eq(classes.id, classId));
      }

      if (body.coachIds) {
        const uniqueCoachIds = Array.from(new Set(body.coachIds));

        // Eliminar asignaciones existentes
        await tx
          .delete(classCoachAssignments)
          .where(eq(classCoachAssignments.classId, classId));

        // Crear nuevas asignaciones
        if (uniqueCoachIds.length > 0) {
          await tx.insert(classCoachAssignments).values(
            uniqueCoachIds.map((coachId) => ({
              id: crypto.randomUUID(),
              tenantId: context.tenantId,
              classId,
              coachId,
            }))
          );
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, { endpoint: `/api/classes/${context.params?.classId}`, method: "PUT" });
  }
});


