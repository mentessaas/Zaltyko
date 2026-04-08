import { headers } from "next/headers";
import { createCapacityNotifications } from "@/lib/alerts/capacity-alerts";
import { createPaymentNotifications } from "@/lib/alerts/payment-alerts";
import { createAttendanceNotifications } from "@/lib/alerts/attendance/createAttendanceNotifications";
import { db } from "@/db";
import { academies, profiles } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(request: Request) {
  // Verificar que la solicitud viene de Vercel Cron
  const authHeader = headers().get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError("UNAUTHORIZED", "No autorizado", 401);
  }

  try {
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

    // Procesar alertas para cada academia
    for (const academy of allAcademies) {
      try {
        // Obtener IDs de usuarios administradores y coaches
        const adminProfiles = await db
          .select({ userId: profiles.userId })
          .from(profiles)
          .where(
            eq(profiles.tenantId, academy.tenantId) &&
            inArray(profiles.role, ["owner", "admin", "super_admin"])
          );

        const adminUserIds = adminProfiles.map(p => p.userId);

        const coachProfiles = await db
          .select({ userId: profiles.userId })
          .from(profiles)
          .where(
            eq(profiles.tenantId, academy.tenantId) &&
            eq(profiles.role, "coach")
          );

        const coachUserIds = coachProfiles.map(p => p.userId);

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

    return apiSuccess({
      ok: true,
      message: "Daily alerts processed successfully",
      academiesProcessed: allAcademies.length,
      results,
    });
  } catch (error: any) {
    logger.error("Error in daily alerts cron", error);
    return apiError("CRON_FAILED", error.message, 500);
  }
}
