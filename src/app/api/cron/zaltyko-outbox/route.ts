import { apiError, apiSuccess } from "@/lib/api-response";
import { runCronWithLease } from "@/lib/cron-lease";
import { withCronSystemActor } from "@/lib/cron-system-actor";
import { logger } from "@/lib/logger";
import { dispatchOutboxBatch } from "@/modules/analytics/application/outbox-dispatcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const cron = await withCronSystemActor(request, (actor) =>
      runCronWithLease("cron:zaltyko-outbox", () =>
        dispatchOutboxBatch({ actor })
      )
    );
    if (!cron.ok) return cron.response;
    const execution = cron.value;
    if (!execution.acquired)
      return apiSuccess({ skipped: true, reason: "LEASE_HELD" });
    return apiSuccess({ skipped: false, ...execution.value });
  } catch (error) {
    logger.error("Zaltyko outbox worker failed", error);
    return apiError(
      "OUTBOX_WORKER_FAILED",
      "No se pudo procesar el outbox",
      500
    );
  }
}
