import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { classes, classSessions, classCoachAssignments } from "@/db/schema";
import { addDays, getDay, format } from "date-fns";

export interface GenerateSessionsOptions {
  classId: string;
  tenantId: string;
  startDate: Date | string;
  endDate: Date | string;
}

export interface GenerateSessionsResult {
  created: number;
  skipped: number;
  sessions: Array<{
    id: string;
    sessionDate: string;
    startTime: string | null;
    endTime: string | null;
    coachId: string | null;
  }>;
}

/**
 * Genera sesiones recurrentes para una clase basándose en su weekday, startTime y endTime
 * @param options Opciones para generar las sesiones
 * @returns Resultado con estadísticas y sesiones creadas
 */
export async function generateRecurringSessions(
  options: GenerateSessionsOptions
): Promise<GenerateSessionsResult> {
  const { classId, tenantId, startDate, endDate } = options;

  // Obtener información de la clase
  const [classData] = await db
    .select({
      id: classes.id,
      weekday: classes.weekday,
      startTime: classes.startTime,
      endTime: classes.endTime,
    })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.tenantId, tenantId)))
    .limit(1);

  if (!classData) {
    throw new Error("CLASS_NOT_FOUND");
  }

  if (classData.weekday === null || classData.weekday === undefined) {
    throw new Error("CLASS_HAS_NO_WEEKDAY");
  }

  // Obtener coach asignado a la clase (tomar el primero si hay múltiples)
  const [coachAssignment] = await db
    .select({
      coachId: classCoachAssignments.coachId,
    })
    .from(classCoachAssignments)
    .where(eq(classCoachAssignments.classId, classId))
    .limit(1);

  const assignedCoachId = coachAssignment?.coachId ?? null;

  // Convertir fechas a Date si son strings
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;

  // Validar rango de fechas (máximo 1 año)
  const maxDays = 365;
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff > maxDays) {
    throw new Error(`RANGE_TOO_LARGE: Maximum ${maxDays} days allowed`);
  }

  if (daysDiff < 0) {
    throw new Error("INVALID_DATE_RANGE: startDate must be before endDate");
  }

  // Obtener sesiones existentes en el rango para evitar duplicados
  const existingSessions = await db
    .select({
      sessionDate: classSessions.sessionDate,
    })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.classId, classId),
        eq(classSessions.tenantId, tenantId)
      )
    );

  const existingDates = new Set(
    existingSessions.map((s) => format(new Date(s.sessionDate), "yyyy-MM-dd"))
  );

  // Generar fechas para el weekday especificado
  const sessionsToCreate: Array<{
    sessionDate: string;
    startTime: string | null;
    endTime: string | null;
    coachId: string | null;
  }> = [];

  const endDateObj = end;
  const targetWeekday = classData.weekday; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

  // Encontrar la primera fecha que coincide con el weekday dentro del rango
  let currentDate = new Date(start);
  const startWeekday = getDay(currentDate); // date-fns: 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  
  // Calcular días a agregar para llegar al weekday objetivo
  // Si targetWeekday es 0 (domingo), lo tratamos como 7 para el cálculo
  const targetDay = targetWeekday === 0 ? 7 : targetWeekday;
  const currentDay = startWeekday === 0 ? 7 : startWeekday;
  
  let daysToAdd = (targetDay - currentDay + 7) % 7;
  
  // Si daysToAdd es 0 y la fecha actual no coincide con el weekday objetivo, avanzar una semana
  if (daysToAdd === 0 && startWeekday !== targetWeekday) {
    daysToAdd = 7;
  }
  
  currentDate = addDays(currentDate, daysToAdd);

  // Si la fecha calculada es antes de startDate, avanzar una semana
  if (currentDate < start) {
    currentDate = addDays(currentDate, 7);
  }

  // Generar todas las fechas que coinciden con el weekday
  while (currentDate <= endDateObj) {
    const dateStr = format(currentDate, "yyyy-MM-dd");

    // Solo crear si no existe ya
    if (!existingDates.has(dateStr)) {
      // Convertir time a string HH:mm si existe
      let startTimeStr: string | null = null;
      let endTimeStr: string | null = null;

      if (classData.startTime) {
        // startTime puede ser un objeto Time de PostgreSQL o string
        const timeStr = typeof classData.startTime === "string" 
          ? classData.startTime 
          : String(classData.startTime);
        startTimeStr = timeStr.length === 8 ? timeStr.substring(0, 5) : timeStr; // HH:mm:ss -> HH:mm
      }

      if (classData.endTime) {
        const timeStr = typeof classData.endTime === "string"
          ? classData.endTime
          : String(classData.endTime);
        endTimeStr = timeStr.length === 8 ? timeStr.substring(0, 5) : timeStr;
      }

      sessionsToCreate.push({
        sessionDate: dateStr,
        startTime: startTimeStr,
        endTime: endTimeStr,
        coachId: assignedCoachId,
      });
    }

    // Avanzar una semana
    currentDate = addDays(currentDate, 7);
  }

  // Insertar sesiones en batch
  const createdSessions: Array<{
    id: string;
    sessionDate: string;
    startTime: string | null;
    endTime: string | null;
    coachId: string | null;
  }> = [];

  if (sessionsToCreate.length > 0) {
    const values = sessionsToCreate.map((session) => ({
      id: crypto.randomUUID(),
      tenantId,
      classId,
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      endTime: session.endTime,
      coachId: session.coachId,
      status: "scheduled" as const,
    }));

    await db.insert(classSessions).values(values);

    // Mapear IDs creados
    createdSessions.push(
      ...values.map((v, idx) => ({
        id: v.id,
        ...sessionsToCreate[idx],
      }))
    );
  }

  return {
    created: sessionsToCreate.length,
    skipped: existingDates.size,
    sessions: createdSessions,
  };
}

