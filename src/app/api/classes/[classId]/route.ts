import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  athletes,
  classCoachAssignments,
  classEnrollments,
  classGroups,
  classWeekdays,
  classes,
  coaches,
  groups,
} from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { verifyClassAccess } from "@/lib/permissions";
import { hasScheduleConflictForAthlete } from "@/lib/classes/schedule-conflicts";

type PgLikeError = {
  code?: string;
  message?: string;
  detail?: string;
  cause?: unknown;
};

function extractPgError(error: unknown): PgLikeError | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  if ("code" in error || "detail" in error) {
    return error as PgLikeError;
  }
  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const cause = error.cause as PgLikeError;
    if ("code" in cause || "detail" in cause) {
      return cause;
    }
  }
  return null;
}

function isRowLevelSecurityError(error: unknown): boolean {
  const pgError = extractPgError(error);
  if (!pgError) return false;
  const message = (pgError.message ?? "").toLowerCase();
  return pgError.code === "42501" || message.includes("row level security");
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  coachIds: z.array(z.string().uuid()).optional(),
  groupIds: z.array(z.string().uuid()).optional(),
  isExtra: z.boolean().optional(),
  groupId: z.string().uuid().nullable().optional(),
});

export const GET = withTenant(async (_request, context) => {
  const classId = (context.params as { classId?: string } | undefined)?.classId;

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

  const weekdayRows = await db
    .select({
      weekday: classWeekdays.weekday,
    })
    .from(classWeekdays)
    .where(eq(classWeekdays.classId, classId));

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

  const groupAssignments = await db
    .select({
      groupId: classGroups.groupId,
      groupName: groups.name,
      groupColor: groups.color,
    })
    .from(classGroups)
    .innerJoin(groups, eq(classGroups.groupId, groups.id))
    .where(eq(classGroups.classId, classId));

  return NextResponse.json({
    item: {
      ...classRow,
      weekdays: weekdayRows.map((row) => row.weekday).sort((a, b) => a - b),
      coaches: assignments,
      groups: groupAssignments.map((g) => ({
        id: g.groupId,
        name: g.groupName,
        color: g.groupColor,
      })),
    },
  });
});

export const PUT = withTenant(async (request, context) => {
  const classId = (context.params as { classId?: string } | undefined)?.classId;
  try {
    if (!classId) {
      return NextResponse.json({ error: "CLASS_ID_REQUIRED", message: "El ID de la clase es requerido" }, { status: 400 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED", message: "El tenant ID es requerido" }, { status: 400 });
    }

    let body;
    try {
      body = updateSchema.parse(await request.json());
    } catch (error) {
      console.error("PUT /api/classes/[classId]: Error de validación", error);
      return handleApiError(error, { endpoint: `/api/classes/${classId}`, method: "PUT" });
    }

    // Verificar acceso a la clase
    const classAccess = await verifyClassAccess(classId, context.tenantId);
    if (!classAccess.allowed) {
      console.error("PUT /api/classes/[classId]: Acceso denegado", { classId, tenantId: context.tenantId, reason: classAccess.reason });
      return NextResponse.json({ 
        error: classAccess.reason ?? "CLASS_NOT_FOUND", 
        message: "No se encontró la clase o no tienes acceso a ella" 
      }, { status: 404 });
    }

    console.log("PUT /api/classes/[classId]: Iniciando actualización", { classId, body, tenantId: context.tenantId });

    // Validar tenantId antes de continuar
    if (!context.tenantId) {
      console.error("PUT /api/classes/[classId]: tenantId es undefined");
      return NextResponse.json({ 
        error: "TENANT_REQUIRED", 
        message: "El tenant ID es requerido para actualizar la clase" 
      }, { status: 400 });
    }

    // Obtener información actual de la clase para validación
    const [currentClass] = await db
      .select({
        id: classes.id,
        academyId: classes.academyId,
        startTime: classes.startTime,
        endTime: classes.endTime,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!currentClass) {
      return NextResponse.json({ error: "CLASS_NOT_FOUND" }, { status: 404 });
    }

    // Determinar si se están modificando horarios o grupos (necesita validación)
    const isChangingSchedule =
      body.weekdays !== undefined ||
      body.startTime !== undefined ||
      body.endTime !== undefined;
    const isChangingGroups = body.groupIds !== undefined;

    console.log("PUT /api/classes/[classId]: Validación de conflictos", {
      isChangingSchedule,
      isChangingGroups,
      weekdays: body.weekdays,
      startTime: body.startTime,
      endTime: body.endTime,
      groupIds: body.groupIds,
    });

    // Si se están modificando horarios o grupos, validar conflictos
    if (isChangingSchedule || isChangingGroups) {
      // Obtener weekdays y horarios que se usarán para validar
      const finalWeekdays =
        body.weekdays !== undefined
          ? Array.from(new Set(body.weekdays)).sort((a, b) => a - b)
          : await db
              .select({ weekday: classWeekdays.weekday })
              .from(classWeekdays)
              .where(eq(classWeekdays.classId, classId))
              .then((rows) => rows.map((r) => r.weekday).sort((a, b) => a - b));

      const finalStartTime =
        body.startTime !== undefined
          ? body.startTime
          : currentClass.startTime
          ? String(currentClass.startTime)
          : null;
      const finalEndTime =
        body.endTime !== undefined
          ? body.endTime
          : currentClass.endTime
          ? String(currentClass.endTime)
          : null;

      // Obtener todos los atletas que estarán en la clase después del cambio
      const athleteIds = new Set<string>();

      // Atletas de grupos (actuales o nuevos según body.groupIds)
      let groupsToCheck: string[] = [];
      if (body.groupIds !== undefined) {
        groupsToCheck = body.groupIds;
      } else {
        const currentGroups = await db
          .select({ groupId: classGroups.groupId })
          .from(classGroups)
          .where(eq(classGroups.classId, classId));
        groupsToCheck = currentGroups.map((r) => r.groupId);
      }

      if (groupsToCheck.length > 0) {
        const groupAthletes = await db
          .select({ athleteId: athletes.id })
          .from(athletes)
          .where(
            and(
              eq(athletes.academyId, currentClass.academyId),
              inArray(athletes.groupId, groupsToCheck)
            )
          );

        groupAthletes.forEach((a) => athleteIds.add(a.athleteId));
      }

      // Atletas extra (enrollments)
      const enrollmentAthletes = await db
        .select({ athleteId: classEnrollments.athleteId })
        .from(classEnrollments)
        .where(eq(classEnrollments.classId, classId));

      enrollmentAthletes.forEach((e) => athleteIds.add(e.athleteId));

      // Validar conflictos para cada atleta
      if (athleteIds.size > 0 && finalWeekdays.length > 0 && finalStartTime && finalEndTime) {
        console.log("PUT /api/classes/[classId]: Validando conflictos", {
          athleteCount: athleteIds.size,
          weekdays: finalWeekdays,
          startTime: finalStartTime,
          endTime: finalEndTime,
        });

        const conflicts: Array<{ athleteId: string; conflictingClass: any }> = [];

        for (const athleteId of athleteIds) {
          try {
            const conflict = await hasScheduleConflictForAthlete(
              currentClass.academyId,
              athleteId,
              classId,
              finalWeekdays,
              finalStartTime,
              finalEndTime,
              classId // Excluir la clase actual
            );

            if (conflict.hasConflict && conflict.conflictingClass) {
              conflicts.push({ athleteId, conflictingClass: conflict.conflictingClass });
            }
          } catch (validationError: any) {
            console.error("PUT /api/classes/[classId]: Error en validación de conflicto", {
              athleteId,
              error: validationError?.message,
            });
            // Si hay un error en la validación, no bloquear el guardado, solo loguear
            // Esto permite que el guardado continúe si hay un problema técnico en la validación
          }
        }

        if (conflicts.length > 0) {
          console.log("PUT /api/classes/[classId]: Conflictos detectados", {
            conflictsCount: conflicts.length,
            conflicts: conflicts.map((c) => ({
              athleteId: c.athleteId,
              conflictingClass: c.conflictingClass.name,
            })),
          });
          return NextResponse.json(
            {
              error: "SCHEDULE_CONFLICT",
              message: `No se puede guardar este horario porque hay ${conflicts.length} atleta${conflicts.length !== 1 ? "s" : ""} que ya tienen otra clase en esa misma franja. Ajusta la hora o revisa los grupos/asignaciones.`,
              conflictsCount: conflicts.length,
            },
            { status: 409 }
          );
        }

        console.log("PUT /api/classes/[classId]: No se detectaron conflictos, continuando con el guardado");
      } else {
        console.log("PUT /api/classes/[classId]: Saltando validación de conflictos", {
          athleteCount: athleteIds.size,
          weekdaysCount: finalWeekdays.length,
          hasStartTime: !!finalStartTime,
          hasEndTime: !!finalEndTime,
        });
      }
    }

    // Usar transacción para garantizar atomicidad
    try {
      await withTransaction(async (tx) => {
        const updates: Record<string, unknown> = {};

        if (body.name !== undefined) updates.name = body.name;
        if (body.startTime !== undefined) updates.startTime = body.startTime;
        if (body.endTime !== undefined) updates.endTime = body.endTime;
        if (body.capacity !== undefined) updates.capacity = body.capacity;
        if (body.isExtra !== undefined) updates.isExtra = body.isExtra;
        if (body.groupId !== undefined) updates.groupId = body.groupId;
        
        const normalizedWeekdays =
          body.weekdays !== undefined ? Array.from(new Set(body.weekdays)).sort((a, b) => a - b) : null;

        if (Object.keys(updates).length > 0) {
          console.log("PUT /api/classes/[classId]: Actualizando clase", updates);
          await tx
            .update(classes)
            .set(updates)
            .where(eq(classes.id, classId));
        }

        if (normalizedWeekdays !== null) {
          console.log("PUT /api/classes/[classId]: Actualizando weekdays", normalizedWeekdays);
          await tx
            .delete(classWeekdays)
            .where(
              and(eq(classWeekdays.classId, classId), eq(classWeekdays.tenantId, context.tenantId!))
            );

          if (normalizedWeekdays.length > 0) {
            const weekdayValues = normalizedWeekdays.map((weekday) => ({
              id: crypto.randomUUID(),
              classId,
              tenantId: context.tenantId!,
              weekday,
            }));
            console.log("PUT /api/classes/[classId]: Insertando weekdays", weekdayValues);
            await tx.insert(classWeekdays).values(weekdayValues);
          }
        }

        if (body.coachIds !== undefined) {
          const uniqueCoachIds = Array.from(new Set(body.coachIds));

          console.log("PUT /api/classes/[classId]: Actualizando coaches", uniqueCoachIds);
          await tx
            .delete(classCoachAssignments)
            .where(
              and(
                eq(classCoachAssignments.classId, classId),
                eq(classCoachAssignments.tenantId, context.tenantId!)
              )
            );

          if (uniqueCoachIds.length > 0) {
            const coachValues = uniqueCoachIds.map((coachId) => ({
              id: crypto.randomUUID(),
              tenantId: context.tenantId!,
              classId,
              coachId,
            }));
            console.log("PUT /api/classes/[classId]: Insertando coaches", coachValues);
            await tx.insert(classCoachAssignments).values(coachValues);
          }
        }

        if (body.groupIds !== undefined) {
          const uniqueGroupIds = Array.from(new Set(body.groupIds));

          console.log("PUT /api/classes/[classId]: Actualizando grupos", uniqueGroupIds);
          await tx
            .delete(classGroups)
            .where(
              and(
                eq(classGroups.classId, classId),
                eq(classGroups.tenantId, context.tenantId!)
              )
            );

          if (uniqueGroupIds.length > 0) {
            const groupValues = uniqueGroupIds.map((groupId) => ({
              id: crypto.randomUUID(),
              tenantId: context.tenantId!,
              classId,
              groupId,
            }));
            console.log("PUT /api/classes/[classId]: Insertando grupos", groupValues);
            await tx.insert(classGroups).values(groupValues);
          }
        }
      });

      console.log("PUT /api/classes/[classId]: Actualización completada exitosamente");
      return NextResponse.json({ ok: true, message: "Clase actualizada correctamente" });
    } catch (transactionError: any) {
      console.error("PUT /api/classes/[classId]: Error en la transacción", {
        error: transactionError?.message,
        stack: transactionError?.stack,
        code: transactionError?.code,
        detail: transactionError?.detail,
        name: transactionError?.name,
      });
      throw transactionError;
    }
  } catch (error) {
    console.error("PUT /api/classes/[classId]: Error capturado en el catch principal", {
      error,
      classId,
      tenantId: context.tenantId,
    });
    return handleApiError(error, { endpoint: `/api/classes/${classId ?? "unknown"}`, method: "PUT" });
  }
});

export const DELETE = withTenant(async (_request, context) => {
  const classId = (context.params as { classId?: string } | undefined)?.classId;
  try {
    if (!classId) {
      return NextResponse.json({ error: "CLASS_ID_REQUIRED", message: "El ID de la clase es requerido" }, { status: 400 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED", message: "El tenant ID es requerido" }, { status: 400 });
    }

    const classAccess = await verifyClassAccess(classId, context.tenantId);
    if (!classAccess.allowed) {
      return NextResponse.json(
        { error: classAccess.reason ?? "CLASS_NOT_FOUND", message: "No se encontró la clase o no tienes acceso a ella" },
        { status: 404 }
      );
    }

    await withTransaction(async (tx) => {
      try {
        await tx
          .delete(classWeekdays)
          .where(and(eq(classWeekdays.classId, classId), eq(classWeekdays.tenantId, context.tenantId!)));
      } catch (error) {
        if (isRowLevelSecurityError(error)) {
          const rlsError: any = new Error(
            "RLS_DENIED_CLASS_WEEKDAYS: operación bloqueada por políticas RLS en class_weekdays."
          );
          rlsError.status = 403;
          rlsError.detail = extractPgError(error);
          throw rlsError;
        }
        throw error;
      }

      try {
        await tx
          .delete(classCoachAssignments)
          .where(
            and(
              eq(classCoachAssignments.classId, classId),
              eq(classCoachAssignments.tenantId, context.tenantId!)
            )
          );
      } catch (error) {
        if (isRowLevelSecurityError(error)) {
          const rlsError: any = new Error(
            "RLS_DENIED_CLASS_COACHES: operación bloqueada por políticas RLS en class_coach_assignments."
          );
          rlsError.status = 403;
          rlsError.detail = extractPgError(error);
          throw rlsError;
        }
        throw error;
      }

      try {
        await tx
          .delete(classGroups)
          .where(
            and(
              eq(classGroups.classId, classId),
              eq(classGroups.tenantId, context.tenantId!)
            )
          );
      } catch (error) {
        if (isRowLevelSecurityError(error)) {
          const rlsError: any = new Error(
            "RLS_DENIED_CLASS_GROUPS: operación bloqueada por políticas RLS en class_groups."
          );
          rlsError.status = 403;
          rlsError.detail = extractPgError(error);
          throw rlsError;
        }
        throw error;
      }

      const deleted = await tx
        .delete(classes)
        .where(and(eq(classes.id, classId), eq(classes.tenantId, context.tenantId!)))
        .returning({ id: classes.id });

      if (deleted.length === 0) {
        const error: any = new Error("CLASS_NOT_FOUND");
        error.status = 404;
        throw error;
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, { endpoint: `/api/classes/${classId ?? "unknown"}`, method: "DELETE" });
  }
});


