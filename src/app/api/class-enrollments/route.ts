import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, athletes, classEnrollments, classes, classWeekdays } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { hasScheduleConflictForAthlete } from "@/lib/classes/schedule-conflicts";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  classId: z.string().uuid(),
  athleteId: z.string().uuid(),
});

/**
 * POST /api/class-enrollments
 * Crea una inscripción extra de un atleta a una clase
 * 
 * IMPORTANTE: Esta inscripción NO afecta la facturación, que sigue basada en el grupo principal.
 */
export const POST = withTenant(async (request, context) => {
  try {
    const body = BodySchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verificar que la academia existe y pertenece al tenant
    const [academyRow] = await db
      .select({ tenantId: academies.tenantId })
      .from(academies)
      .where(eq(academies.id, body.academyId))
      .limit(1);

    if (!academyRow) {
      return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
    }

    if (academyRow.tenantId !== context.tenantId && context.profile.role !== "super_admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // Verificar que la clase existe y pertenece a la academia
    const [classRow] = await db
      .select({
        id: classes.id,
        academyId: classes.academyId,
        name: classes.name,
        startTime: classes.startTime,
        endTime: classes.endTime,
      })
      .from(classes)
      .where(and(eq(classes.id, body.classId), eq(classes.academyId, body.academyId)))
      .limit(1);

    if (!classRow) {
      return NextResponse.json({ error: "CLASS_NOT_FOUND" }, { status: 404 });
    }

    // Obtener weekdays de la clase
    const weekdayRows = await db
      .select({
        weekday: classWeekdays.weekday,
      })
      .from(classWeekdays)
      .where(eq(classWeekdays.classId, body.classId));

    const weekdays = weekdayRows.map((row) => row.weekday);

    // Validar conflicto de horario antes de crear el enrollment
    const startTime = classRow.startTime ? String(classRow.startTime) : null;
    const endTime = classRow.endTime ? String(classRow.endTime) : null;

    const conflict = await hasScheduleConflictForAthlete(
      body.academyId,
      body.athleteId,
      body.classId,
      weekdays,
      startTime,
      endTime
    );

    if (conflict.hasConflict && conflict.conflictingClass) {
      const conflictMessage = conflict.conflictingClass.startTime && conflict.conflictingClass.endTime
        ? `Conflicto de horario: este atleta ya está en la clase "${conflict.conflictingClass.name}" de ${conflict.conflictingClass.startTime}-${conflict.conflictingClass.endTime} el mismo día. No puede estar en dos clases a la vez.`
        : `Conflicto de horario: este atleta ya está en la clase "${conflict.conflictingClass.name}" el mismo día. No puede estar en dos clases a la vez.`;

      return NextResponse.json(
        {
          error: "SCHEDULE_CONFLICT",
          message: conflictMessage,
          conflictingClass: conflict.conflictingClass,
        },
        { status: 409 }
      );
    }

    // Verificar que el atleta existe y pertenece a la academia
    const [athleteRow] = await db
      .select({ id: athletes.id, academyId: athletes.academyId })
      .from(athletes)
      .where(and(eq(athletes.id, body.athleteId), eq(athletes.academyId, body.academyId)))
      .limit(1);

    if (!athleteRow) {
      return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
    }

    // Verificar si ya existe el enrollment (evitar duplicados)
    const [existing] = await db
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.classId, body.classId),
          eq(classEnrollments.athleteId, body.athleteId),
          eq(classEnrollments.tenantId, context.tenantId)
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "ENROLLMENT_EXISTS", message: "El atleta ya está inscrito en esta clase como extra." },
        { status: 409 }
      );
    }

    // Crear el enrollment
    const [enrollment] = await db
      .insert(classEnrollments)
      .values({
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        academyId: body.academyId,
        classId: body.classId,
        athleteId: body.athleteId,
      })
      .returning();

    return NextResponse.json({ ok: true, id: enrollment.id });
  } catch (error) {
    return handleApiError(error);
  }
});

