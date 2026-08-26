<<<<<<< HEAD
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { athletes, guardianAthletes, guardians } from "@/db/schema";
import { createNotification } from "@/lib/notifications/notification-service";
import { detectAttendanceAlerts } from "../attendance-alerts";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { logger } from "@/lib/logger";
=======
import { createNotification } from "@/lib/notifications/notification-service";
import { detectAttendanceAlerts } from "../attendance-alerts";
>>>>>>> origin/main

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

<<<<<<< HEAD
    // Enviar email a padres/tutores del atleta en riesgo
    try {
      const athleteGuardians = await db
        .select({ email: guardians.email, name: guardians.name })
        .from(guardianAthletes)
        .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
        .innerJoin(athletes, eq(athletes.id, alert.athleteId))
        .where(eq(guardianAthletes.athleteId, alert.athleteId));

      for (const guardian of athleteGuardians) {
        if (!guardian.email) continue;
        const dedupeKey = `attendance-risk:${alert.athleteId}:${new Date().toISOString().slice(0, 10)}`;
        await sendEmailWithLogging({
          to: guardian.email,
          subject: `Seguimiento de asistencia: ${alert.athleteName}`,
          html: `<p>Hola ${guardian.name || "familia"},</p><p>Te escribimos desde la academia para informarte que ${alert.athleteName} tiene una asistencia del ${alert.attendanceRate}% en los últimos ${alert.daysChecked} días (umbral: ${alert.threshold}%).</p><p>Si hay algún motivo que podamos apoyar, no dudes en contactar con tu entrenadora.</p>`,
          template: "attendance-risk",
          tenantId,
          academyId,
          dedupeKey,
          metadata: { athleteId: alert.athleteId, attendanceRate: alert.attendanceRate },
        });
      }
    } catch (error) {
      logger.warn("No se pudo enviar email de riesgo a padres", { error, athleteId: alert.athleteId });
    }
=======
    // TODO: Enviar email a padres usando el servicio de email
>>>>>>> origin/main
  }
}

