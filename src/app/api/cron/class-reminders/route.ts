import { sendClassReminders } from "@/lib/alerts/class-reminders";
import { db } from "@/db";
import { academies, profiles } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    // Obtener todas las academias activas
    const allAcademies = await db
      .select({
        id: academies.id,
        tenantId: academies.tenantId,
      })
      .from(academies);

    // Enviar recordatorios para cada academia
    for (const academy of allAcademies) {
      try {
        // Obtener IDs de usuarios administradores y owners
        const adminProfiles = await db
          .select({ userId: profiles.userId })
          .from(profiles)
          .where(and(
            eq(profiles.tenantId, academy.tenantId),
            inArray(profiles.role, ["owner", "admin", "super_admin"])
          ));

        const adminUserIds = adminProfiles.map(p => p.userId);
        void adminUserIds;

        await sendClassReminders(academy.id, academy.tenantId, 24);
      } catch (error) {
        logger.error(`Error sending reminders for academy ${academy.id}`, error, { academyId: academy.id });
        // Continuar con la siguiente academia
      }
    }

    return apiSuccess({
      ok: true,
      message: "Class reminders sent successfully",
      academiesProcessed: allAcademies.length,
    });
  } catch (error: any) {
    logger.error("Error in class reminders cron", error);
    return apiError("CRON_FAILED", "Cron job failed", 500);
  }
}
