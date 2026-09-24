import { db } from "@/db";
import { classes, groups } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";
import { createNotification } from "@/lib/notifications/notification-service";
import { logger } from "@/lib/logger";

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
        maxCapacity: classes.capacity,
      })
      .from(classes)
      .leftJoin(groups, eq(classes.groupId, groups.id))
      .where(
        and(
          eq(classes.academyId, academyId),
          eq(classes.tenantId, tenantId),
          isNull(classes.deletedAt),
          isNull(groups.deletedAt)
        )
      )
      .limit(1000);

    const alerts: CapacityAlert[] = [];

    // Las academias pueden tener cientos de clases. Procesar en lotes pequeños
    // evita una cascada secuencial interminable sin abrir cientos de consultas
    // simultáneas contra Supabase.
    const BATCH_SIZE = 8;
    for (let index = 0; index < classGroups.length; index += BATCH_SIZE) {
      const batch = classGroups.slice(index, index + BATCH_SIZE);
      const batchAlerts = await Promise.all(
        batch.map(async (classGroup) => {
          if (!classGroup.maxCapacity) return null;

          const currentCapacity = (await getClassAthletes(classGroup.classId, academyId)).length;
          const percentage = (currentCapacity / classGroup.maxCapacity) * 100;
          if (percentage < threshold) return null;

          return {
            classId: classGroup.classId,
            className: classGroup.className || "Sin nombre",
            currentCapacity,
            maxCapacity: classGroup.maxCapacity,
            percentage: Math.round(percentage * 100) / 100,
          } satisfies CapacityAlert;
        })
      );
      alerts.push(...batchAlerts.filter((alert): alert is CapacityAlert => alert !== null));
    }

    return alerts;
  } catch (error) {
    logger.error("Error detecting capacity alerts:", error);
    throw error;
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
