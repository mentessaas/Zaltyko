/**
 * Helpers para detectar conflictos de horarios entre clases
 * 
 * Garantiza que un atleta no pueda estar en dos clases que se solapen
 * en horario el mismo día de la semana.
 */

import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  athletes,
  athleteExtraClasses,
  classCoachAssignments,
  classEnrollments,
  classGroups,
  classSessions,
  classWeekdays,
  classes,
  coaches,
  groups,
} from "@/db/schema";

export interface ScheduleConflict {
  hasConflict: boolean;
  conflictingClass?: {
    id: string;
    name: string;
    weekday?: number;
    startTime: string | null;
    endTime: string | null;
    date?: string; // Para clases con fecha específica
    type?: "base" | "extra" | "session";
  };
  conflictType?: "athlete" | "coach";
}

/**
 * Convierte un string de tiempo "HH:MM" a minutos desde medianoche
 * @param timeString String en formato "HH:MM" o null
 * @returns Minutos desde medianoche, o null si el string es null/vacío
 */
function timeToMinutes(timeString: string | null): number | null {
  if (!timeString || timeString.trim() === "") {
    return null;
  }

  const parts = timeString.split(":");
  if (parts.length !== 2) {
    return null;
  }

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

/**
 * Verifica si dos intervalos de tiempo se solapan
 * 
 * Regla: hay solapamiento si start1 < end2 && end1 > start2
 * 
 * Casos especiales:
 * - Si algún tiempo es null, no hay solapamiento (horario flexible)
 * - Si una clase termina exactamente cuando otra empieza (ej: 18:00-18:00), NO hay conflicto (permitir clases consecutivas)
 * 
 * @param start1 Hora inicio del primer intervalo (formato "HH:MM" o null)
 * @param end1 Hora fin del primer intervalo (formato "HH:MM" o null)
 * @param start2 Hora inicio del segundo intervalo (formato "HH:MM" o null)
 * @param end2 Hora fin del segundo intervalo (formato "HH:MM" o null)
 * @returns true si hay solapamiento, false en caso contrario
 */
export function timeOverlaps(
  start1: string | null,
  end1: string | null,
  start2: string | null,
  end2: string | null
): boolean {
  // Si algún intervalo no tiene horario definido, no hay conflicto (horario flexible)
  if (!start1 || !end1 || !start2 || !end2) {
    return false;
  }

  const start1Minutes = timeToMinutes(start1);
  const end1Minutes = timeToMinutes(end1);
  const start2Minutes = timeToMinutes(start2);
  const end2Minutes = timeToMinutes(end2);

  // Si alguna conversión falló, no hay conflicto
  if (
    start1Minutes === null ||
    end1Minutes === null ||
    start2Minutes === null ||
    end2Minutes === null
  ) {
    return false;
  }

  // Hay solapamiento si: start1 < end2 && end1 > start2
  // Nota: usamos < y > estrictos para permitir clases consecutivas (ej: 18:00-18:00 no solapa)
  return start1Minutes < end2Minutes && end1Minutes > start2Minutes;
}

/**
 * Detecta si hay conflicto de horario para un atleta al asignarlo a una clase
 * 
 * @param academyId ID de la academia
 * @param athleteId ID del atleta
 * @param classId ID de la clase que se quiere asignar/editar
 * @param weekdays Días de la semana de la nueva clase (0-6, donde 0=domingo)
 * @param startTime Horario de inicio (formato "HH:MM" o null)
 * @param endTime Horario de fin (formato "HH:MM" o null)
 * @param excludeClassId Opcional: ID de clase a excluir de la comparación (útil en edición)
 * @returns Objeto con hasConflict y información de la clase conflictiva (si existe)
 */
export async function hasScheduleConflictForAthlete(
  academyId: string,
  athleteId: string,
  classId: string,
  weekdays: number[],
  startTime: string | null,
  endTime: string | null,
  excludeClassId?: string
): Promise<ScheduleConflict> {
  // Si no hay horario definido o no hay días, no hay conflicto
  if (!startTime || !endTime || weekdays.length === 0) {
    return { hasConflict: false };
  }

  // 1. Obtener todas las clases donde el atleta está

  // 1.1. Clases por grupo principal
  const [athlete] = await db
    .select({
      groupId: athletes.groupId,
    })
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), eq(athletes.academyId, academyId)))
    .limit(1);

  if (!athlete) {
    return { hasConflict: false };
  }

  const classIdsFromGroups: string[] = [];
  if (athlete.groupId) {
    const groupClasses = await db
      .select({
        classId: classGroups.classId,
      })
      .from(classGroups)
      .where(eq(classGroups.groupId, athlete.groupId));

    classIdsFromGroups.push(...groupClasses.map((row) => row.classId));
  }

  // 1.2. Clases por enrollment
  const enrollmentClasses = await db
    .select({
      classId: classEnrollments.classId,
    })
    .from(classEnrollments)
    .where(
      and(
        eq(classEnrollments.athleteId, athleteId),
        eq(classEnrollments.academyId, academyId)
      )
    );

  const enrollmentClassIds = enrollmentClasses.map((row) => row.classId);

  // Combinar todas las clases donde el atleta está
  const allClassIds = Array.from(
    new Set([...classIdsFromGroups, ...enrollmentClassIds])
  ).filter((id) => id !== excludeClassId); // Excluir la clase que estamos editando

  if (allClassIds.length === 0) {
    return { hasConflict: false };
  }

  // 2. Obtener información de esas clases (weekdays y horarios)
  // Si no hay clases, retornar sin conflicto
  if (allClassIds.length === 0) {
    return { hasConflict: false };
  }

  const existingClasses = await db
    .select({
      id: classes.id,
      name: classes.name,
      startTime: classes.startTime,
      endTime: classes.endTime,
    })
    .from(classes)
    .where(
      and(
        eq(classes.academyId, academyId),
        inArray(classes.id, allClassIds)
      )
    );

  // Obtener weekdays para cada clase
  const classWeekdayRows =
    allClassIds.length > 0
      ? await db
          .select({
            classId: classWeekdays.classId,
            weekday: classWeekdays.weekday,
          })
          .from(classWeekdays)
          .where(inArray(classWeekdays.classId, allClassIds))
      : [];

  // Agrupar weekdays por clase
  const weekdaysByClass = new Map<string, number[]>();
  for (const row of classWeekdayRows) {
    const existing = weekdaysByClass.get(row.classId) || [];
    existing.push(row.weekday);
    weekdaysByClass.set(row.classId, existing);
  }

  // 3. Comparar cada clase existente con la nueva
  for (const existingClass of existingClasses) {
    const existingWeekdays = weekdaysByClass.get(existingClass.id) || [];

    // Verificar si hay días en común
    const commonWeekdays = weekdays.filter((day) => existingWeekdays.includes(day));

    if (commonWeekdays.length === 0) {
      // No hay días en común, no hay conflicto
      continue;
    }

    // Verificar solapamiento de horarios
    const existingStartTime = existingClass.startTime
      ? String(existingClass.startTime)
      : null;
    const existingEndTime = existingClass.endTime
      ? String(existingClass.endTime)
      : null;

    if (timeOverlaps(startTime, endTime, existingStartTime, existingEndTime)) {
      // Hay conflicto: mismo día y horarios solapados
      return {
        hasConflict: true,
        conflictingClass: {
          id: existingClass.id,
          name: existingClass.name ?? "Clase sin nombre",
          weekday: commonWeekdays[0], // Devolver el primer día conflictivo
          startTime: existingStartTime,
          endTime: existingEndTime,
        },
      };
    }
  }

  return { hasConflict: false };
}

/**
 * Convierte un datetime a minutos desde una fecha de referencia
 * @param datetimeString String en formato ISO o "YYYY-MM-DD HH:MM" o null
 * @param referenceDate Fecha de referencia para calcular minutos relativos
 * @returns Minutos desde la fecha de referencia, o null si el string es null/vacío
 */
function datetimeToMinutes(
  datetimeString: string | null,
  referenceDate: Date
): number | null {
  if (!datetimeString || datetimeString.trim() === "") {
    return null;
  }

  try {
    const dt = new Date(datetimeString);
    if (isNaN(dt.getTime())) {
      return null;
    }

    // Calcular diferencia en minutos desde la fecha de referencia
    const diffMs = dt.getTime() - referenceDate.getTime();
    return Math.floor(diffMs / (1000 * 60));
  } catch {
    return null;
  }
}

/**
 * Verifica si dos intervalos de datetime se solapan
 * 
 * @param start1 Hora inicio del primer intervalo (datetime string o null)
 * @param end1 Hora fin del primer intervalo (datetime string o null)
 * @param start2 Hora inicio del segundo intervalo (datetime string o null)
 * @param end2 Hora fin del segundo intervalo (datetime string o null)
 * @returns true si hay solapamiento, false en caso contrario
 */
export function datetimeOverlaps(
  start1: string | null,
  end1: string | null,
  start2: string | null,
  end2: string | null
): boolean {
  // Si algún intervalo no tiene horario definido, no hay conflicto
  if (!start1 || !end1 || !start2 || !end2) {
    return false;
  }

  try {
    const start1Date = new Date(start1);
    const end1Date = new Date(end1);
    const start2Date = new Date(start2);
    const end2Date = new Date(end2);

    if (
      isNaN(start1Date.getTime()) ||
      isNaN(end1Date.getTime()) ||
      isNaN(start2Date.getTime()) ||
      isNaN(end2Date.getTime())
    ) {
      return false;
    }

    // Hay solapamiento si: start1 < end2 && end1 > start2
    return start1Date < end2Date && end1Date > start2Date;
  } catch {
    return false;
  }
}

/**
 * Verifica conflictos de horario para un atleta o entrenador
 * 
 * Esta función mejora la validación anterior para:
 * - Aceptar datetime completo (no solo time)
 * - Validar tanto atletas como entrenadores
 * - Considerar clases base, extra y sesiones específicas
 * 
 * @param params Parámetros de validación
 * @returns Objeto con hasConflict y información del conflicto
 */
export async function checkScheduleConflict(params: {
  tenantId: string;
  academyId: string;
  athleteId?: string;
  coachId?: string;
  startTime: string; // ISO datetime string
  endTime: string; // ISO datetime string
  excludeClassId?: string;
}): Promise<ScheduleConflict> {
  const { tenantId, academyId, athleteId, coachId, startTime, endTime, excludeClassId } = params;

  if (!athleteId && !coachId) {
    return { hasConflict: false };
  }

  const conflicts: Array<{
    id: string;
    name: string;
    startTime: string | null;
    endTime: string | null;
    date?: string;
    type: "base" | "extra" | "session";
  }> = [];

  // Validar conflictos para atleta
  if (athleteId) {
    // 1. Clases base del grupo del atleta
    const [athlete] = await db
      .select({
        groupId: athletes.groupId,
      })
      .from(athletes)
      .where(and(eq(athletes.id, athleteId), eq(athletes.academyId, academyId)))
      .limit(1);

    if (athlete?.groupId) {
      // Obtener clases del grupo
      const groupClasses = await db
        .select({
          id: classes.id,
          name: classes.name,
          startTime: classes.startTime,
          endTime: classes.endTime,
          groupId: classes.groupId,
        })
        .from(classes)
        .innerJoin(classGroups, eq(classes.id, classGroups.classId))
        .where(
          and(
            eq(classGroups.groupId, athlete.groupId),
            eq(classes.academyId, academyId),
            excludeClassId ? ne(classes.id, excludeClassId) : undefined
          )
        );

      // Verificar conflictos con clases base (necesitamos obtener weekdays y comparar)
      for (const cls of groupClasses) {
        if (!cls.startTime || !cls.endTime) continue;

        // Obtener weekdays de la clase
        const weekdays = await db
          .select({ weekday: classWeekdays.weekday })
          .from(classWeekdays)
          .where(eq(classWeekdays.classId, cls.id));

        // Obtener el día de la semana de startTime
        const startDate = new Date(startTime);
        const startWeekday = startDate.getDay();

        // Verificar si la clase base ocurre en el mismo día de la semana
        const hasMatchingWeekday = weekdays.some((w) => w.weekday === startWeekday);

        if (hasMatchingWeekday) {
          // Construir datetime completo para la clase base
          const baseStartTime = `${startDate.toISOString().split("T")[0]} ${String(cls.startTime)}`;
          const baseEndTime = `${startDate.toISOString().split("T")[0]} ${String(cls.endTime)}`;

          if (datetimeOverlaps(startTime, endTime, baseStartTime, baseEndTime)) {
            conflicts.push({
              id: cls.id,
              name: cls.name ?? "Clase sin nombre",
              startTime: String(cls.startTime),
              endTime: String(cls.endTime),
              type: "base",
            });
          }
        }
      }
    }

    // 2. Clases extra del atleta (athlete_extra_classes)
    const extraClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        startTime: classes.startTime,
        endTime: classes.endTime,
      })
      .from(athleteExtraClasses)
      .innerJoin(classes, eq(athleteExtraClasses.classId, classes.id))
      .where(
        and(
          eq(athleteExtraClasses.athleteId, athleteId),
          eq(athleteExtraClasses.academyId, academyId),
          excludeClassId ? ne(classes.id, excludeClassId) : undefined
        )
      );

    for (const cls of extraClasses) {
      if (!cls.startTime || !cls.endTime) continue;

      // Para clases extra, necesitamos verificar si tienen sesiones específicas o son recurrentes
      // Por ahora, asumimos que son recurrentes y verificamos por weekday
      const weekdays = await db
        .select({ weekday: classWeekdays.weekday })
        .from(classWeekdays)
        .where(eq(classWeekdays.classId, cls.id));

      const startDate = new Date(startTime);
      const startWeekday = startDate.getDay();

      const hasMatchingWeekday = weekdays.some((w) => w.weekday === startWeekday);

      if (hasMatchingWeekday) {
        const extraStartTime = `${startDate.toISOString().split("T")[0]} ${String(cls.startTime)}`;
        const extraEndTime = `${startDate.toISOString().split("T")[0]} ${String(cls.endTime)}`;

        if (datetimeOverlaps(startTime, endTime, extraStartTime, extraEndTime)) {
          conflicts.push({
            id: cls.id,
            name: cls.name ?? "Clase sin nombre",
            startTime: String(cls.startTime),
            endTime: String(cls.endTime),
            type: "extra",
          });
        }
      }

      // También verificar sesiones específicas de la clase extra
      // Nota: excludeClassId se refiere al classId, no al sessionId
      const sessionWhere = excludeClassId && excludeClassId === cls.id
        ? and(eq(classSessions.classId, cls.id), ne(classSessions.classId, excludeClassId))
        : eq(classSessions.classId, cls.id);

      const sessions = await db
        .select({
          id: classSessions.id,
          sessionDate: classSessions.sessionDate,
          startTime: classSessions.startTime,
          endTime: classSessions.endTime,
        })
        .from(classSessions)
        .where(sessionWhere);

      for (const session of sessions) {
        if (!session.startTime || !session.endTime || !session.sessionDate) continue;

        const sessionStart = `${session.sessionDate} ${session.startTime}`;
        const sessionEnd = `${session.sessionDate} ${session.endTime}`;

        if (datetimeOverlaps(startTime, endTime, sessionStart, sessionEnd)) {
          conflicts.push({
            id: session.id,
            name: cls.name ?? "Clase sin nombre",
            startTime: session.startTime,
            endTime: session.endTime,
            date: session.sessionDate,
            type: "session",
          });
        }
      }
    }
  }

  // Validar conflictos para entrenador
  if (coachId) {
    // Obtener todas las clases asignadas al entrenador
    const coachClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        startTime: classes.startTime,
        endTime: classes.endTime,
      })
      .from(classCoachAssignments)
      .innerJoin(classes, eq(classCoachAssignments.classId, classes.id))
      .where(
        and(
          eq(classCoachAssignments.coachId, coachId),
          eq(classes.academyId, academyId),
          excludeClassId ? ne(classes.id, excludeClassId) : undefined
        )
      );

    for (const cls of coachClasses) {
      if (!cls.startTime || !cls.endTime) continue;

      // Verificar por weekday
      const weekdays = await db
        .select({ weekday: classWeekdays.weekday })
        .from(classWeekdays)
        .where(eq(classWeekdays.classId, cls.id));

      const startDate = new Date(startTime);
      const startWeekday = startDate.getDay();

      const hasMatchingWeekday = weekdays.some((w) => w.weekday === startWeekday);

      if (hasMatchingWeekday) {
        const coachStartTime = `${startDate.toISOString().split("T")[0]} ${String(cls.startTime)}`;
        const coachEndTime = `${startDate.toISOString().split("T")[0]} ${String(cls.endTime)}`;

        if (datetimeOverlaps(startTime, endTime, coachStartTime, coachEndTime)) {
          conflicts.push({
            id: cls.id,
            name: cls.name ?? "Clase sin nombre",
            startTime: String(cls.startTime),
            endTime: String(cls.endTime),
            type: cls.groupId ? "base" : "extra",
          });
        }
      }

      // Verificar sesiones específicas
      // Nota: excludeClassId se refiere al classId, no al sessionId
      const sessionWhere = excludeClassId && excludeClassId === cls.id
        ? and(eq(classSessions.classId, cls.id), ne(classSessions.classId, excludeClassId))
        : eq(classSessions.classId, cls.id);

      const sessions = await db
        .select({
          id: classSessions.id,
          sessionDate: classSessions.sessionDate,
          startTime: classSessions.startTime,
          endTime: classSessions.endTime,
        })
        .from(classSessions)
        .where(sessionWhere);

      for (const session of sessions) {
        if (!session.startTime || !session.endTime || !session.sessionDate) continue;

        const sessionStart = `${session.sessionDate} ${session.startTime}`;
        const sessionEnd = `${session.sessionDate} ${session.endTime}`;

        if (datetimeOverlaps(startTime, endTime, sessionStart, sessionEnd)) {
          conflicts.push({
            id: session.id,
            name: cls.name ?? "Clase sin nombre",
            startTime: session.startTime,
            endTime: session.endTime,
            date: session.sessionDate,
            type: "session",
          });
        }
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      hasConflict: true,
      conflictingClass: conflicts[0],
      conflictType: athleteId ? "athlete" : "coach",
    };
  }

  return { hasConflict: false };
}

