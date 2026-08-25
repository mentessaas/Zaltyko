import { triggerAttendanceReminders } from "@/lib/email/triggers";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:class-reminders", async () => {
      // Recordatorios de clase (email 24h antes) a los inscritos reales de
      // cada sesión de mañana. Dedupe por sesión+atleta en el log de emails.
      const sent = await triggerAttendanceReminders();

      return {
        ok: true,
        message: "Recordatorios de clase procesados",
        remindersSent: sent,
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
