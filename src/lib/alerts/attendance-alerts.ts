import { db } from "@/db";
import {
  athletes,
  attendanceRecords,
  classSessions,
  classes,
  familyContacts,
} from "@/db/schema";
import { eq, and, gte, count, sql } from "drizzle-orm";
import { createNotification } from "@/lib/notifications/notification-service";
import { subDays } from "date-fns";

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
    .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, tenantId)));

  const alerts: AttendanceAlert[] = [];

  for (const athlete of academyAthletes) {
    // Contar total de sesiones en el período
    const [totalSessions] = await db
      .select({ count: sql<number>`count(distinct ${classSessions.id})` })
      .from(classSessions)
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          eq(classes.academyId, academyId),
          eq(classes.tenantId, tenantId),
          gte(classSessions.sessionDate, cutoffDateStr)
        )
      );

    // Contar asistencias del atleta
    const [presentCount] = await db
      .select({ count: count() })
      .from(attendanceRecords)
      .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          eq(attendanceRecords.athleteId, athlete.athleteId),
          eq(attendanceRecords.status, "present"),
          eq(classes.academyId, academyId),
          gte(classSessions.sessionDate, cutoffDateStr)
        )
      );

    const total = Number(totalSessions?.count || 0);
    const present = Number(presentCount?.count || 0);
    const attendanceRate = total > 0 ? (present / total) * 100 : 0;

    if (attendanceRate < threshold && total > 0) {
      // Obtener contactos de familia
      const contacts = await db
        .select({ contactId: familyContacts.contactId })
        .from(familyContacts)
        .where(eq(familyContacts.athleteId, athlete.athleteId));

      alerts.push({
        athleteId: athlete.athleteId,
        athleteName: athlete.athleteName || "Sin nombre",
        attendanceRate: Math.round(attendanceRate * 100) / 100,
        threshold,
        daysChecked: total,
        parentContactIds: contacts.map((c) => c.contactId),
      });
    }
  }

    return alerts;
  } catch (error) {
    console.error("Error detecting attendance alerts:", error);
    return [];
  }
}

/**
 * Crea notificaciones para alertas de asistencia
 */
export async function createAttendanceNotifications(
  academyId: string,
  tenantId: string,
  adminUserIds: string[],
  coachUserIds: string[]
) {
  const alerts = await detectAttendanceAlerts(academyId, tenantId);

  // Validar que alerts sea un array
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return;
  }

  for (const alert of alerts) {
    // Notificar a administradores y coaches
    const allUserIds = [...adminUserIds, ...coachUserIds];

    for (const userId of allUserIds) {
      await createNotification({
        tenantId,
        userId,
        type: "attendance_low",
        title: `Baja asistencia: ${alert.athleteName}`,
        message: `El atleta tiene una tasa de asistencia del ${alert.attendanceRate}% (umbral: ${alert.threshold}%) en los últimos ${alert.daysChecked} días.`,
        data: {
          athleteId: alert.athleteId,
          attendanceRate: alert.attendanceRate,
          threshold: alert.threshold,
        },
      });
    }

    // TODO: Enviar email a padres usando el servicio de email
  }
}

