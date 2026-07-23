import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { triggerScheduledPaymentReminders } from "@/lib/email/triggers";
import { logger } from "@/lib/logger";
import { runCronWithLease } from "@/lib/cron-lease";

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

  try {
    const execution = await runCronWithLease("cron:payment-reminders", () =>
      triggerScheduledPaymentReminders()
    );
    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }
    return apiSuccess({ sent: execution.value ?? 0 });
  } catch (error) {
    logger.error("Payment reminders cron failed", error);
    return apiError("PAYMENT_REMINDERS_FAILED", "No se pudieron enviar los recordatorios", 500);
  }
}
