import { createCapacityNotifications } from "@/lib/alerts/capacity-alerts";
import { createPaymentNotifications } from "@/lib/alerts/payment-alerts";
import { createAttendanceNotifications } from "@/lib/alerts/attendance/createAttendanceNotifications";
import { db } from "@/db";
import { academies, profiles } from "@/db/schema";
import { and, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const startedAt = Date.now();

  try {
    logger.info("Daily alerts cron started");

    // Obtener todas las academias activas
    const allAcademies = await db
      .select({
        id: academies.id,
        tenantId: academies.tenantId,
      })
      .from(academies);

    const results = {
      capacity: { succeeded: 0, failed: 0 },
      payments: { succeeded: 0, failed: 0 },
      attendance: { succeeded: 0, failed: 0 },
    };
    const failedAcademyIds = new Set<string>();

    if (allAcademies.length === 0) {
      return apiSuccess({ ok: true, message: "No hay academias activas", academiesProcessed: 0, results });
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
          results.capacity.succeeded++;
        } catch (error) {
          results.capacity.failed++;
          failedAcademyIds.add(academy.id);
          logger.error(`Error creating capacity alerts for academy ${academy.id}`, error, { academyId: academy.id });
        }

        // Alertas de pagos
        try {
          await createPaymentNotifications(academy.id, academy.tenantId, adminUserIds);
          results.payments.succeeded++;
        } catch (error) {
          results.payments.failed++;
          failedAcademyIds.add(academy.id);
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
          results.attendance.succeeded++;
        } catch (error) {
          results.attendance.failed++;
          failedAcademyIds.add(academy.id);
          logger.error(`Error creating attendance alerts for academy ${academy.id}`, error, { academyId: academy.id });
        }
      } catch (error) {
        failedAcademyIds.add(academy.id);
        logger.error(`Error processing alerts for academy ${academy.id}`, error, { academyId: academy.id });
        // Continuar con la siguiente academia
      }
    }

    const summary = {
      ok: true,
      message: "Daily alerts processed successfully",
      academiesProcessed: allAcademies.length,
      academiesSucceeded: allAcademies.length - failedAcademyIds.size,
      academiesFailed: failedAcademyIds.size,
      operationsFailed:
        results.capacity.failed + results.payments.failed + results.attendance.failed,
      results,
    };

    logger.info("Daily alerts cron completed", {
      ...summary,
      durationMs: Date.now() - startedAt,
    });

    return apiSuccess(summary);
  } catch (error: unknown) {
    logger.error("Error in daily alerts cron", error, {
      durationMs: Date.now() - startedAt,
    });
    return apiError("CRON_FAILED", "Cron job failed", 500);
  }
}
