import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { logger } from "@/lib/logger";
import { runOwnerWeeklyDigest } from "@/modules/habitual-use/application/owner-weekly-digest";

export const dynamic = "force-dynamic";
// Recorre por páginas hasta agotar lo pendiente: se fija el máximo de la plataforma para no cortarlo.
export const maxDuration = 300;

/**
 * Resumen semanal de dirección: el lunes por la mañana (hora de la sede), solo
 * con lo accionable y nada si no hay nada. Apagado por defecto: hace falta
 * ZALTYKO_HABITUAL_USE_ENABLED y ZALTYKO_OWNER_WEEKLY_DIGEST_ENABLED. Pensado
 * para correr cada hora; la deduplicación por semana evita repetir el envío. No
 * está programado en vercel.json: programarlo es una decisión de Elvis.
 */
export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:owner-weekly-digest", () => runOwnerWeeklyDigest());
    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }
    return apiSuccess(execution.value);
  } catch (error) {
    logger.error("Error enviando el resumen semanal de dirección:", error);
    return apiError("INTERNAL_ERROR", "Error interno del servidor", 500);
  }
}

// Vercel Cron invoca los paths configurados mediante GET. Mantener POST permite
// disparos operativos explícitos con el mismo contrato de autenticación.
export const GET = POST;
