import { db } from "@/db";
import { classSessions, classCoachAssignments } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

/**
 * Verifica si un coach está disponible en un horario específico
 * @param coachId - ID del coach
 * @param date - Fecha de la sesión
 * @param startTime - Hora de inicio (formato HH:mm)
 * @param endTime - Hora de fin (formato HH:mm)
 * @returns true si el coach está disponible, false si hay conflicto
 */
export async function checkCoachAvailability(
  coachId: string,
  date: Date,
  startTime: string,
  endTime: string
): Promise<boolean> {
  // Validar que startTime < endTime
  if (startTime >= endTime) {
    throw new Error("startTime must be before endTime");
  }

  const dateStr = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD

  // Buscar sesiones del coach en esa fecha usando join a través de classId
  const existingSessions = await db
    .select({
      id: classSessions.id,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime
    })
    .from(classSessions)
    .innerJoin(classCoachAssignments, eq(classSessions.classId, classCoachAssignments.classId))
    .where(
      and(
        eq(classCoachAssignments.coachId, coachId),
        eq(classSessions.sessionDate, dateStr)
      )
    );

  // Verificar conflicto de horario
  for (const session of existingSessions) {
    const sessionStart = session.startTime || "";
    const sessionEnd = session.endTime || "";

    // Conflicto si los rangos se solapan
    if (sessionStart < endTime && sessionEnd > startTime) {
      return false; // Conflicto encontrado
    }
  }

  return true;
}
