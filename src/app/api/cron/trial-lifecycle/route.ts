import { apiError, apiSuccess } from "@/lib/api-response";
import { processTrialLifecycle } from "@/lib/billing/trial-service";
import { requireCronAuth } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const startedAt = Date.now();

  try {
    logger.info("Trial lifecycle cron started");
    const summary = await processTrialLifecycle();
    logger.info("Trial lifecycle cron completed", {
      ...summary,
      durationMs: Date.now() - startedAt,
    });
    return apiSuccess(summary);
  } catch (error) {
    logger.error("Trial lifecycle cron failed", error, {
      durationMs: Date.now() - startedAt,
    });
    return apiError("TRIAL_LIFECYCLE_FAILED", "No se pudo procesar el ciclo de pruebas", 500);
  }
}
