import { apiSuccess, apiError } from "@/lib/api-response";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  athletes,
  classEnrollments,
  classGroups,
  classes,
  classWeekdays,
  groupAthletes,
} from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { hasScheduleConflictForAthlete } from "@/lib/classes/schedule-conflicts";
import { withTransaction } from "@/lib/db-transactions";

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
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    // Verificar que la academia existe y pertenece al tenant
    const [academyRow] = await db
      .select({ tenantId: academies.tenantId })
      .from(academies)
      .where(eq(academies.id, body.academyId))
      .limit(1);

    if (!academyRow) {
      return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
    }

    if (
      academyRow.tenantId !== context.tenantId &&
      context.profile.role !== "super_admin"
    ) {
      return apiError("FORBIDDEN", "Access denied", 403);
    }

    // Verificar que la clase existe y pertenece a la academia
    const [classRow] = await db
      .select({
        id: classes.id,
        academyId: classes.academyId,
        name: classes.name,
        sportConfigId: classes.sportConfigId,
        startTime: classes.startTime,
        endTime: classes.endTime,
      })
      .from(classes)
      .where(
        and(
          eq(classes.id, body.classId),
          eq(classes.academyId, body.academyId),
          eq(classes.tenantId, context.tenantId)
        )
      )
      .limit(1);

    if (!classRow) {
      return apiError("CLASS_NOT_FOUND", "Class not found", 404);
    }

    // Obtener weekdays de la clase
    const weekdayRows = await db
      .select({
        weekday: classWeekdays.weekday,
      })
      .from(classWeekdays)
      .where(eq(classWeekdays.classId, body.classId))
      .limit(7);

    const weekdays = weekdayRows.map((row) => row.weekday);

    // Validar conflicto de horario antes de crear el enrollment
    const startTime = classRow.startTime ? String(classRow.startTime) : null;
    const endTime = classRow.endTime ? String(classRow.endTime) : null;

    const conflict = await hasScheduleConflictForAthlete(
      body.academyId,
      context.tenantId,
      body.athleteId,
      body.classId,
      weekdays,
      startTime,
      endTime
    );

    if (conflict.hasConflict && conflict.conflictingClass) {
      const conflictMessage =
        conflict.conflictingClass.startTime && conflict.conflictingClass.endTime
          ? `Conflicto de horario: este atleta ya está en la clase "${conflict.conflictingClass.name}" de ${conflict.conflictingClass.startTime}-${conflict.conflictingClass.endTime} el mismo día. No puede estar en dos clases a la vez.`
          : `Conflicto de horario: este atleta ya está en la clase "${conflict.conflictingClass.name}" el mismo día. No puede estar en dos clases a la vez.`;

      return apiError("SCHEDULE_CONFLICT", conflictMessage, 409, {
        conflictingClass: conflict.conflictingClass,
      });
    }

    // Verificar que el atleta existe y pertenece a la academia
    const [athleteRow] = await db
      .select({
        id: athletes.id,
        academyId: athletes.academyId,
        primarySportConfigId: athletes.primarySportConfigId,
      })
      .from(athletes)
      .where(
        and(
          eq(athletes.id, body.athleteId),
          eq(athletes.academyId, body.academyId),
          eq(athletes.tenantId, context.tenantId)
        )
      )
      .limit(1);

    if (!athleteRow) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }

    if (
      classRow.sportConfigId &&
      athleteRow.primarySportConfigId &&
      athleteRow.primarySportConfigId !== classRow.sportConfigId
    ) {
      return apiError(
        "ATHLETE_SPORT_CONFIG_MISMATCH",
        "El atleta pertenece a otra modalidad/rama y no puede añadirse a esta clase.",
        400
      );
    }

    // Capacidad + inserción deben ser atómicas. El advisory lock serializa
    // altas concurrentes de la misma clase y evita vender más plazas que las
    // disponibles (la comprobación anterior tenía una ventana de carrera).
    const enrollmentResult = await withTransaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${body.classId}))`
      );

      const [classWithCapacity] = await tx
        .select({ capacity: classes.capacity, academyId: classes.academyId })
        .from(classes)
        .where(
          and(
            eq(classes.id, body.classId),
            eq(classes.tenantId, context.tenantId)
          )
        )
        .limit(1);

      if (classWithCapacity?.capacity != null) {
        const occupancyResult = await tx.execute(sql`
          select count(distinct athlete_id)::int as current from (
            select ga.athlete_id
            from ${classGroups} cg
            join ${groupAthletes} ga
              on ga.group_id = cg.group_id and ga.tenant_id = cg.tenant_id
            join ${athletes} a
              on a.id = ga.athlete_id and a.tenant_id = cg.tenant_id
            where cg.class_id = ${body.classId}
              and cg.tenant_id = ${context.tenantId}
              and a.academy_id = ${classWithCapacity.academyId}
              and a.deleted_at is null
            union
            select ga.athlete_id
            from ${groupAthletes} ga
            join ${athletes} a
              on a.id = ga.athlete_id and a.tenant_id = ga.tenant_id
            where ga.group_id = (select group_id from ${classes} where id = ${body.classId})
              and ga.tenant_id = ${context.tenantId}
              and a.academy_id = ${classWithCapacity.academyId}
              and a.deleted_at is null
            union
            select a.id
            from ${athletes} a
            where a.group_id = (select group_id from ${classes} where id = ${body.classId})
              and a.tenant_id = ${context.tenantId}
              and a.academy_id = ${classWithCapacity.academyId}
              and a.deleted_at is null
            union
            select ce.athlete_id
            from ${classEnrollments} ce
            join ${athletes} a on a.id = ce.athlete_id
            where ce.class_id = ${body.classId}
              and ce.tenant_id = ${context.tenantId}
              and ce.academy_id = ${classWithCapacity.academyId}
              and a.deleted_at is null
          ) effective
        `);
        const occupancy = Number(
          (occupancyResult.rows[0] as { current?: number } | undefined)
            ?.current ?? 0
        );
        if (occupancy >= classWithCapacity.capacity)
          return { kind: "full" as const };
      }

      const [enrollment] = await tx
        .insert(classEnrollments)
        .values({
          id: crypto.randomUUID(),
          tenantId: context.tenantId,
          academyId: body.academyId,
          classId: body.classId,
          athleteId: body.athleteId,
        })
        .onConflictDoNothing({
          target: [
            classEnrollments.tenantId,
            classEnrollments.classId,
            classEnrollments.athleteId,
          ],
        })
        .returning({ id: classEnrollments.id });

      return enrollment
        ? { kind: "created" as const, id: enrollment.id }
        : { kind: "exists" as const };
    });

    if (enrollmentResult.kind === "full") {
      return apiError(
        "CLASS_FULL",
        "La clase ha alcanzado su capacidad máxima.",
        400
      );
    }
    if (enrollmentResult.kind === "exists") {
      return apiError(
        "ENROLLMENT_EXISTS",
        "El atleta ya está inscrito en esta clase como extra.",
        409
      );
    }

    return apiSuccess({ ok: true, id: enrollmentResult.id });
  } catch (error) {
    return handleApiError(error);
  }
});
