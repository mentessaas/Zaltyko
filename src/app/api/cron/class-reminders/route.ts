import { sendClassReminders } from "@/lib/alerts/class-reminders";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const startedAt = Date.now();

  try {
    logger.info("Class reminders cron started");

    // Obtener todas las academias activas
    const allAcademies = await db
      .select({
        id: academies.id,
        tenantId: academies.tenantId,
      })
      .from(academies);

    const results = {
      academies: allAcademies.length,
      succeeded: 0,
      failed: 0,
    };

    // Enviar recordatorios para cada academia
    for (const academy of allAcademies) {
      try {
        await sendClassReminders(academy.id, academy.tenantId, 24);
        results.succeeded += 1;
      } catch (error) {
        results.failed += 1;
        logger.error(`Error sending reminders for academy ${academy.id}`, error, { academyId: academy.id });
        // Continuar con la siguiente academia
      }
    }

    logger.info("Class reminders cron completed", {
      ...results,
      durationMs: Date.now() - startedAt,
    });

    return apiSuccess(results);
  } catch (error: unknown) {
    logger.error("Error in class reminders cron", error, {
      durationMs: Date.now() - startedAt,
    });
    return apiError("CRON_FAILED", "Cron job failed", 500);
  }
}
