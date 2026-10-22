export const dynamic = 'force-dynamic';

import { NextRequest } from "next/server";
import { generateSessionsForAllTenants } from "@/lib/generate-class-sessions";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

/**
 * Cron job para generar sesiones automáticamente
 * Se ejecuta diariamente a las 2:00 AM
 *
 * Configuración en vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/generate-sessions",
 *     "schedule": "0 2 * * *"
 *   }]
 * }
 *
 * Nota: Vercel Cron no tiene retry incorporado. Este handler implementa
 * retry interno simple para errores transitorios. Para retry robusto,
 * considerar BullMQ + Vercel KV o un sistema de cola externo.
 */
async function generateWithRetries() {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await generateSessionsForAllTenants(4);
    } catch (error) {
      lastError = error;
      logger.error("Error generando sesiones", error, { attempt });
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  throw lastError;
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:generate-sessions", generateWithRetries);
    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }
    const result = execution.value!;
    return apiSuccess({
      success: true,
      timestamp: new Date().toISOString(),
      result: {
        tenants_processed: result.total_tenants,
        classes_processed: result.total_classes,
        sessions_generated: result.total_generated,
        sessions_skipped: result.total_skipped,
        errors_count: Object.keys(result.errors).length,
      },
    });
  } catch (error) {
    logger.error("Max retries exceeded, cron job failed permanently", error);
    return apiError("CRON_FAILED", "Cron job failed", 500);
  }
}
