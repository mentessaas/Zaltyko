import { createNotification } from "@/lib/notifications/notification-service";
import { detectAttendanceAlerts } from "../attendance-alerts";

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

