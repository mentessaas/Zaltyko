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
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";

const updateSchema = z.object({
  classIds: z.array(z.string().uuid()),
});

export const GET = withTenant(async (_request, context) => {
  const coachId = (context.params as { coachId?: string })?.coachId;

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
  try {
    const coachId = (context.params as { coachId?: string })?.coachId;

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

    // Usar transacción para garantizar atomicidad
    await withTransaction(async (tx) => {
      // Eliminar asignaciones existentes
      await tx
        .delete(classCoachAssignments)
        .where(eq(classCoachAssignments.coachId, coachId));

      // Crear nuevas asignaciones
      if (body.classIds.length > 0) {
        const uniqueClassIds = Array.from(new Set(body.classIds));
        const records = uniqueClassIds.map((classId) => ({
          id: crypto.randomUUID(),
          tenantId: context.tenantId,
          classId,
          coachId,
        }));

        await tx.insert(classCoachAssignments).values(records);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const coachId = (context.params as { coachId?: string })?.coachId;
    return handleApiError(error, { endpoint: `/api/coaches/${coachId}/assignments`, method: "PUT" });
  }
});


