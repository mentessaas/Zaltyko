import { db } from "@/db";
import { academies } from "@/db/schema";
import { sendClassReminders } from "@/lib/alerts/class-reminders";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";

const REMINDER_HOURS_AHEAD = 24;

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:class-reminders", async () => {
      // Iteramos por academia con try/catch isolate: un fallo de notificación
      // en una academia no debe tumbar el cron global (antes, una excepción se
      // propagaba al `catch` exterior → 500 → cero academias procesadas).
      const allAcademies = await db
        .select({ id: academies.id, tenantId: academies.tenantId })
        .from(academies);

      let academiesProcessed = 0;

      for (const academy of allAcademies) {
        // Contamos ANTES del try para que `academiesProcessed` refleje academias
        // intentadas (éxito o fallo). Esto da al operador una métrica honesta
        // de cobertura del cron y evita el bug "1 falla → 0 procesadas".
        academiesProcessed++;

        try {
          await sendClassReminders(academy.id, academy.tenantId, REMINDER_HOURS_AHEAD);
        } catch (error) {
          logger.error(
            `Error sending reminders for academy ${academy.id}`,
            error as Error,
            { academyId: academy.id },
          );
        }
      }

      return {
        ok: true,
        message: "Class reminders sent successfully",
        academiesProcessed,
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
