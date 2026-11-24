import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { logger } from "@/lib/logger";
import { eraseExpiredContactLeads } from "@/lib/growth/lead-retention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Deletes unconverted contact leads after six months without linked activity.
 * Each batch is transactional and bounded; only aggregate counts are returned
 * or logged. Scheduling candidate, not applied: docs/deployment/scheduler/
 * candidates/lead-retention.sql.
 */
export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:lead-retention", () =>
      eraseExpiredContactLeads()
    );
    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }
    logger.info("Contact lead retention completed", execution.value);
    return apiSuccess(execution.value);
  } catch (error) {
    // Error details may contain submitted contact data; log only the error type.
    logger.error("Error deleting expired contact leads:", undefined, {
      name: error instanceof Error ? error.name : "unknown",
    });
    return apiError("INTERNAL_ERROR", "Error interno del servidor", 500);
  }
}

export const GET = POST;
