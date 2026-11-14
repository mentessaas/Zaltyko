import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { logger } from "@/lib/logger";
import { runAtRiskAlert } from "@/modules/habitual-use/application/at-risk-alert";

export const dynamic = "force-dynamic";

/**
 * Aviso a Elvis de academias que entran en riesgo (7 días o más sin actividad del
 * equipo). Apagado por defecto: hace falta ZALTYKO_HABITUAL_USE_ENABLED,
 * ZALTYKO_USAGE_METRICS_ENABLED, ZALTYKO_AT_RISK_ALERTS_ENABLED y un destinatario
 * en ZALTYKO_AT_RISK_ALERT_EMAIL. Pensado para correr una vez al día. No está
 * programado en vercel.json: programarlo es una decisión de Elvis.
 */
export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:usage-at-risk", () => runAtRiskAlert());
    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }
    return apiSuccess(execution.value);
  } catch (error) {
    logger.error("Error avisando de academias en riesgo:", error);
    return apiError("INTERNAL_ERROR", "Error interno del servidor", 500);
  }
}

// Vercel Cron invoca los paths configurados mediante GET. Mantener POST permite
// disparos operativos explícitos con el mismo contrato de autenticación.
export const GET = POST;
