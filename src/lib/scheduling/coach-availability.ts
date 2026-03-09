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

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Buscar sesiones del coach en esa fecha usando leftJoin para incluir sesiones sin coach
  const existingSessions = await db
    .select({
      id: classSessions.id,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime
    })
    .from(classSessions)
    .leftJoin(classCoachAssignments, eq(classSessions.id, classCoachAssignments.sessionId))
    .where(
      and(
        eq(classCoachAssignments.coachId, coachId),
        gte(classSessions.sessionDate, dayStart),
        lte(classSessions.sessionDate, dayEnd)
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
