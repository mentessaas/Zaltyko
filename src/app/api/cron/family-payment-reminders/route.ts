import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { logger } from "@/lib/logger";
import { runAutomaticPaymentReminders } from "@/modules/payment-reminders/application/service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

/**
 * Recordatorio automático de cuotas vencidas. Apagado por defecto: hace falta
 * ZALTYKO_PAYMENT_REMINDERS_ENABLED y ZALTYKO_PAYMENT_REMINDERS_AUTO_ENABLED, y
 * además que la academia lo active en su configuración. Con la bandera apagada
 * responde «enabled: false» sin tocar nada. No está programado en vercel.json:
 * programarlo es una decisión de Elvis.
 */
export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:family-payment-reminders", () => runAutomaticPaymentReminders());
    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }
    return apiSuccess(execution.value);
  } catch (error) {
    if (error instanceof OperationalError && error.code === "FEATURE_NOT_AVAILABLE") {
      return apiSuccess({ enabled: false, reason: "UNAVAILABLE" });
    }
    logger.error("Error enviando recordatorios automáticos de cuotas:", error);
    return apiError("INTERNAL_ERROR", "Error interno del servidor", 500);
  }
}

// Vercel Cron invoca los paths configurados mediante GET. Mantener POST permite
// disparos operativos explícitos con el mismo contrato de autenticación.
export const GET = POST;
