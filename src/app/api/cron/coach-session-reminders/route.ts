import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { logger } from "@/lib/logger";
import { runCoachSessionReminders } from "@/modules/habitual-use/application/coach-reminders";

export const dynamic = "force-dynamic";
// Recorre por páginas hasta agotar lo pendiente: se fija el máximo de la plataforma para no cortarlo.
export const maxDuration = 300;

/**
 * Avisos a quien entrena: unos 15 minutos antes de cada sesión y un único
 * recordatorio si la sesión terminó sin lista. Apagado por defecto: hace falta
 * ZALTYKO_HABITUAL_USE_ENABLED y ZALTYKO_COACH_REMINDERS_ENABLED; con cualquiera
 * apagada responde «enabled: false» sin tocar la base de datos. Pensado para
 * correr cada 5 minutos. No está programado en vercel.json: programarlo es una
 * decisión de Elvis.
 */
export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:coach-session-reminders", () => runCoachSessionReminders());
    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }
    return apiSuccess(execution.value);
  } catch (error) {
    logger.error("Error enviando avisos de clase a entrenadoras:", error);
    return apiError("INTERNAL_ERROR", "Error interno del servidor", 500);
  }
}

// Vercel Cron invoca los paths configurados mediante GET. Mantener POST permite
// disparos operativos explícitos con el mismo contrato de autenticación.
export const GET = POST;
