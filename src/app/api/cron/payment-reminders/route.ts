import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { triggerScheduledPaymentReminders } from "@/lib/email/triggers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/payment-reminders
 *
 * Recordatorios automáticos de cuotas en 4 ventanas (-3, 0, +3, +7 días respecto
 * al vencimiento). Ejecución diaria. Reutiliza Brevo vía email-service.
 */
export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const startedAt = Date.now();

  try {
    logger.info("Payment reminders cron started");
    const summary = await triggerScheduledPaymentReminders();
    logger.info("Payment reminders cron completed", {
      ...summary,
      durationMs: Date.now() - startedAt,
    });
    return apiSuccess(summary);
  } catch (error) {
    logger.error("Payment reminders cron failed", error, {
      durationMs: Date.now() - startedAt,
    });
    return apiError("PAYMENT_REMINDERS_FAILED", "No se pudieron enviar los recordatorios", 500);
  }
}
