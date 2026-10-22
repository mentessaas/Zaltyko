import { db } from "@/db";
import {
  athletes,
  attendanceRecords,
  classSessions,
  classes,
  familyContacts,
} from "@/db/schema";
import { eq, and, gte, count, isNull, inArray } from "drizzle-orm";
import { subDays } from "date-fns";
import { logger } from "@/lib/logger";

export interface AttendanceAlert {
  athleteId: string;
  athleteName: string;
  attendanceRate: number;
  threshold: number;
  daysChecked: number;
  parentContactIds: string[];
}

/**
 * Detecta atletas con baja asistencia
 */
export async function detectAttendanceAlerts(
  academyId: string,
  tenantId: string,
  threshold: number = 70,
  daysToCheck: number = 30
): Promise<AttendanceAlert[]> {
  try {
    const cutoffDate = subDays(new Date(), daysToCheck);
    const cutoffDateStr = cutoffDate.toISOString().split("T")[0];

    // Obtener todos los atletas de la academia
    const academyAthletes = await db
      .select({
        athleteId: athletes.id,
        athleteName: athletes.name,
      })
      .from(athletes)
      .where(
        and(
          eq(athletes.academyId, academyId),
          eq(athletes.tenantId, tenantId),
          eq(athletes.status, "active"),
          isNull(athletes.deletedAt)
        )
      )
      .limit(5000);

    if (academyAthletes.length === 0) return [];

    const athleteIds = academyAthletes.map((athlete) => athlete.athleteId);

    // El porcentaje debe usar las sesiones registradas para cada atleta, no
    // todas las sesiones de la academia (una academia con varios grupos haría
    // parecer ausente a cualquier atleta que no asiste a todos). Agrupamos en
    // una sola consulta y mantenemos el mapa en memoria para resolver cada
    // atleta en O(1).
    const presentRows = await db
      .select({
        athleteId: attendanceRecords.athleteId,
        status: attendanceRecords.status,
        count: count(),
      })
      .from(attendanceRecords)
      .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          inArray(attendanceRecords.athleteId, athleteIds),
          eq(attendanceRecords.tenantId, tenantId),
          eq(attendanceRecords.status, "present"),
          eq(classes.academyId, academyId),
          eq(classes.tenantId, tenantId),
          eq(classSessions.tenantId, tenantId),
          isNull(classes.deletedAt),
          gte(classSessions.sessionDate, cutoffDateStr)
        )
      )
      .groupBy(attendanceRecords.athleteId, attendanceRecords.status);
    const statsByAthlete = new Map<string, { present: number; total: number }>();
    for (const row of presentRows) {
      const current = statsByAthlete.get(row.athleteId) ?? { present: 0, total: 0 };
      const rowCount = Number(row.count);
      current.total += rowCount;
      if (row.status === "present") current.present += rowCount;
      statsByAthlete.set(row.athleteId, current);
    }

    const familyContactRows = await db
      .select({ athleteId: familyContacts.athleteId, contactId: familyContacts.id })
      .from(familyContacts)
      .where(
        and(
          inArray(familyContacts.athleteId, athleteIds),
          eq(familyContacts.tenantId, tenantId)
        )
      )
      .limit(10000);
    const contactsByAthlete = new Map<string, string[]>();
    for (const row of familyContactRows) {
      const contacts = contactsByAthlete.get(row.athleteId) ?? [];
      contacts.push(row.contactId);
      contactsByAthlete.set(row.athleteId, contacts);
    }

    const alerts: AttendanceAlert[] = [];

    for (const athlete of academyAthletes) {
      const stats = statsByAthlete.get(athlete.athleteId);
      if (!stats || stats.total === 0) continue;
      const { present, total } = stats;
      const attendanceRate = total > 0 ? (present / total) * 100 : 0;

      if (attendanceRate < threshold && total > 0) {
        alerts.push({
          athleteId: athlete.athleteId,
          athleteName: athlete.athleteName || "Sin nombre",
          attendanceRate: Math.round(attendanceRate * 100) / 100,
          threshold,
          daysChecked: total,
          parentContactIds: contactsByAthlete.get(athlete.athleteId) ?? [],
        });
      }
    }

    return alerts;
  } catch (error) {
    logger.error("Error detecting attendance alerts:", error);
    throw error;
  }
}

// Re-exportar función de notificaciones desde su módulo dedicado
export * from "./attendance/createAttendanceNotifications";
