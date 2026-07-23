import { createCapacityNotifications } from "@/lib/alerts/capacity-alerts";
import { createPaymentNotifications } from "@/lib/alerts/payment-alerts";
import { createAttendanceNotifications } from "@/lib/alerts/attendance/createAttendanceNotifications";
import { db } from "@/db";
import { academies, profiles } from "@/db/schema";
import { and, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:daily-alerts", async () => {
      // Obtener todas las academias activas
      const allAcademies = await db
      .select({
        id: academies.id,
        tenantId: academies.tenantId,
      })
      .from(academies);

    const results = {
      capacityAlerts: 0,
      paymentAlerts: 0,
      attendanceAlerts: 0,
    };

      if (allAcademies.length === 0) {
        return { ok: true, message: "No hay academias activas", academiesProcessed: 0, results };
      }

    // Traer todos los perfiles relevantes en una sola query (evita N+1)
    const tenantIds = [...new Set(allAcademies.map((a) => a.tenantId))];
    const allRelevantProfiles = await db
      .select({ userId: profiles.userId, tenantId: profiles.tenantId, role: profiles.role })
      .from(profiles)
      .where(
        and(
          inArray(profiles.tenantId, tenantIds),
          inArray(profiles.role, ["owner", "admin", "super_admin", "coach"])
        )
      );

    // Agrupar por tenantId para acceso O(1) dentro del loop
    const profilesByTenant = new Map<
      string,
      { adminUserIds: string[]; coachUserIds: string[] }
    >();
    for (const p of allRelevantProfiles) {
      if (!p.tenantId) continue;
      const entry = profilesByTenant.get(p.tenantId) ?? { adminUserIds: [], coachUserIds: [] };
      if (p.role === "coach") {
        entry.coachUserIds.push(p.userId);
      } else {
        entry.adminUserIds.push(p.userId);
      }
      profilesByTenant.set(p.tenantId, entry);
    }

    // Procesar alertas para cada academia
    for (const academy of allAcademies) {
      try {
        const { adminUserIds = [], coachUserIds = [] } = profilesByTenant.get(academy.tenantId) ?? {};

        // Alertas de capacidad
        try {
          await createCapacityNotifications(academy.id, academy.tenantId, adminUserIds);
          results.capacityAlerts++;
        } catch (error) {
          logger.error(`Error creating capacity alerts for academy ${academy.id}`, error, { academyId: academy.id });
        }

        // Alertas de pagos
        try {
          await createPaymentNotifications(academy.id, academy.tenantId, adminUserIds);
          results.paymentAlerts++;
        } catch (error) {
          logger.error(`Error creating payment alerts for academy ${academy.id}`, error, { academyId: academy.id });
        }

        // Alertas de asistencia
        try {
          await createAttendanceNotifications(
            academy.id,
            academy.tenantId,
            adminUserIds,
            coachUserIds
          );
          results.attendanceAlerts++;
        } catch (error) {
          logger.error(`Error creating attendance alerts for academy ${academy.id}`, error, { academyId: academy.id });
        }
      } catch (error) {
        logger.error(`Error processing alerts for academy ${academy.id}`, error, { academyId: academy.id });
        // Continuar con la siguiente academia
      }
    }

      return {
        ok: true,
        message: "Daily alerts processed successfully",
        academiesProcessed: allAcademies.length,
        results,
      };
    });
    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }
    return apiSuccess(execution.value);
  } catch (error: unknown) {
    logger.error("Error in daily alerts cron", error);
    return apiError("CRON_FAILED", "Cron job failed", 500);
  }
}
