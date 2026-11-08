import { randomUUID } from "node:crypto";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { logger } from "@/lib/logger";
import { extendSessionHorizons } from "@/modules/scheduling/application/session-horizon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:session-horizon", () =>
      extendSessionHorizons({ correlationId: randomUUID() })
    );
    if (!execution.acquired) return apiSuccess({ skipped: true, reason: "LEASE_HELD" });
    return apiSuccess({ skipped: false, ...execution.value });
  } catch (error) {
    logger.error("Session horizon cron failed", error);
    return apiError("SESSION_HORIZON_FAILED", "No se pudo ampliar el calendario de sesiones", 500);
  }
}

export const GET = handle;
export const POST = handle;
