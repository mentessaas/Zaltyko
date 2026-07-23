import { apiError, apiSuccess } from "@/lib/api-response";
import { processTrialLifecycle } from "@/lib/billing/trial-service";
import { requireCronAuth } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { runCronWithLease } from "@/lib/cron-lease";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:trial-lifecycle", () =>
      processTrialLifecycle()
    );
    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }
    return apiSuccess(execution.value);
  } catch (error) {
    logger.error("Trial lifecycle cron failed", error);
    return apiError("TRIAL_LIFECYCLE_FAILED", "No se pudo procesar el ciclo de pruebas", 500);
  }
}
