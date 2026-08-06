import { sql } from "drizzle-orm";

import { db } from "@/db";
import { apiError, apiSuccess } from "@/lib/api-response";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * @route-auth public
 *
 * Read-only liveness/readiness signal for the external monitoring workflow.
 * Do not expose provider details or database errors from this endpoint.
 */
export async function GET() {
  const startedAt = performance.now();

  try {
    await db.execute(sql`select 1`);
    const latencyMs = Math.round((performance.now() - startedAt) * 100) / 100;

    return apiSuccess({
      status: "ok",
      checks: {
        database: { status: "ok", latencyMs },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const latencyMs = Math.round((performance.now() - startedAt) * 100) / 100;
    logger.error("Health check failed", error, { check: "database", latencyMs });

    return apiError("HEALTH_CHECK_FAILED", "Service health check failed", 503, {
      status: "degraded",
      checks: { database: { status: "failed", latencyMs } },
      timestamp: new Date().toISOString(),
    });
  }
}
