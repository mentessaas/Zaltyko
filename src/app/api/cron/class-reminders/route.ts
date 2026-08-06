import { sendClassReminders } from "@/lib/alerts/class-reminders";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:class-reminders", async () => {
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
        await sendClassReminders(academy.id, academy.tenantId, 24);
      } catch (error) {
        logger.error(`Error sending reminders for academy ${academy.id}`, error, { academyId: academy.id });
        // Continuar con la siguiente academia
      }
    }

      return {
        ok: true,
        message: "Class reminders sent successfully",
        academiesProcessed: allAcademies.length,
      };
    });
    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }
    return apiSuccess(execution.value);
  } catch (error: unknown) {
    logger.error("Error in class reminders cron", error);
    return apiError("CRON_FAILED", "Cron job failed", 500);
  }
}
