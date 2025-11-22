import { db } from "@/db";
import { classes, classSessions, groupAthletes, groups } from "@/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { createNotification } from "@/lib/notifications/notification-service";

// Re-exportar para uso en otros archivos
export { createCapacityNotifications };

export interface CapacityAlert {
  classId: string;
  className: string;
  currentCapacity: number;
  maxCapacity: number;
  percentage: number;
}

/**
 * Detecta clases con cupo lleno o casi lleno
 */
export async function detectCapacityAlerts(
  academyId: string,
  tenantId: string,
  threshold: number = 90
): Promise<CapacityAlert[]> {
  try {
    // Obtener todas las clases con sus grupos
    const classGroups = await db
      .select({
        classId: classes.id,
        className: classes.name,
        groupId: groups.id,
        maxCapacity: classes.maxCapacity,
      })
      .from(classes)
      .leftJoin(groups, eq(classes.groupId, groups.id))
      .where(and(eq(classes.academyId, academyId), eq(classes.tenantId, tenantId)));

    const alerts: CapacityAlert[] = [];

  for (const classGroup of classGroups) {
    if (!classGroup.maxCapacity) continue;

    // Contar atletas en el grupo o clase
    let currentCapacity = 0;

    if (classGroup.groupId) {
      const [countResult] = await db
        .select({ count: count() })
        .from(groupAthletes)
        .where(eq(groupAthletes.groupId, classGroup.groupId));
      currentCapacity = Number(countResult?.count || 0);
    } else {
      // Si no hay grupo, contar sesiones programadas (simplificado)
      const [countResult] = await db
        .select({ count: count() })
        .from(classSessions)
        .where(eq(classSessions.classId, classGroup.classId));
      currentCapacity = Number(countResult?.count || 0);
    }

    const percentage = (currentCapacity / classGroup.maxCapacity) * 100;

    if (percentage >= threshold) {
      alerts.push({
        classId: classGroup.classId,
        className: classGroup.className || "Sin nombre",
        currentCapacity,
        maxCapacity: classGroup.maxCapacity,
        percentage: Math.round(percentage * 100) / 100,
      });
    }
  }

    return alerts;
  } catch (error) {
    console.error("Error detecting capacity alerts:", error);
    return [];
  }
}

/**
 * Crea notificaciones para alertas de capacidad
 */
export async function createCapacityNotifications(
  academyId: string,
  tenantId: string,
  adminUserIds: string[]
) {
  const alerts = await detectCapacityAlerts(academyId, tenantId);

  // Validar que alerts sea un array
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return;
  }

  for (const alert of alerts) {
    for (const userId of adminUserIds) {
      await createNotification({
        tenantId,
        userId,
        type: "capacity_alert",
        title: `Cupo casi lleno: ${alert.className}`,
        message: `La clase "${alert.className}" tiene ${alert.currentCapacity}/${alert.maxCapacity} atletas (${alert.percentage}% de capacidad).`,
        data: {
          classId: alert.classId,
          currentCapacity: alert.currentCapacity,
          maxCapacity: alert.maxCapacity,
          percentage: alert.percentage,
        },
      });
    }
  }
}

