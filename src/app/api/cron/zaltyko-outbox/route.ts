import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { logger } from "@/lib/logger";
import { dispatchOutboxBatch } from "@/modules/analytics/application/outbox-dispatcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:zaltyko-outbox", () =>
      dispatchOutboxBatch()
    );
    if (!execution.acquired) return apiSuccess({ skipped: true, reason: "LEASE_HELD" });
    return apiSuccess({ skipped: false, ...execution.value });
  } catch (error) {
    logger.error("Zaltyko outbox worker failed", error);
    return apiError("OUTBOX_WORKER_FAILED", "No se pudo procesar el outbox", 500);
  }
}
