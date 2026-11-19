import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { logger } from "@/lib/logger";
import { eraseExpiredNoticeSenders } from "@/modules/element-library/application/notices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Conservación de los avisos sobre contenido (ADR-0029 §8.2): borra nombre y
 * correo de quien avisó en los avisos cerrados hace más de dos años, por lotes
 * de 100. No depende de la bandera de la biblioteca: solo de que exista la
 * tabla de avisos. Responde solo contadores. Programación candidata, sin
 * aplicar: docs/deployment/scheduler/candidates/content-notices-retention.sql.
 */
export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:content-notices-retention", () => eraseExpiredNoticeSenders());
    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }
    return apiSuccess(execution.value);
  } catch (error) {
    // Solo el tipo de error: el mensaje de la base podría llevar datos del aviso.
    logger.error("Error borrando remitentes de avisos de contenido:", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return apiError("INTERNAL_ERROR", "Error interno del servidor", 500);
  }
}

// Vercel Cron invoca los paths configurados mediante GET. Mantener POST permite
// disparos operativos explícitos con el mismo contrato de autenticación.
export const GET = POST;
