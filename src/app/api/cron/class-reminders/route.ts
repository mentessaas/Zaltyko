<<<<<<< HEAD
import { triggerAttendanceReminders } from "@/lib/email/triggers";
=======
import { sendClassReminders } from "@/lib/alerts/class-reminders";
import { db } from "@/db";
import { academies } from "@/db/schema";
>>>>>>> origin/main
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:class-reminders", async () => {
<<<<<<< HEAD
      // Recordatorios de clase (email 24h antes) a los inscritos reales de
      // cada sesión de mañana. Dedupe por sesión+atleta en el log de emails.
      const sent = await triggerAttendanceReminders();

      return {
        ok: true,
        message: "Recordatorios de clase procesados",
        remindersSent: sent,
=======
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
>>>>>>> origin/main
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
