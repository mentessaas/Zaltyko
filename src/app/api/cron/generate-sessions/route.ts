export const dynamic = 'force-dynamic';

import { NextRequest } from "next/server";
import { generateSessionsForAllTenants } from "@/lib/generate-class-sessions";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";

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
export async function GET(request: NextRequest) {
    const parsedRetryCount = Number.parseInt(request.headers.get("x-retry-count") || "0", 10);
    const retryCount = Number.isFinite(parsedRetryCount) && parsedRetryCount >= 0
        ? parsedRetryCount
        : 0;
    const startedAt = Date.now();

    try {
        const authError = requireCronAuth(request);
        if (authError) return authError;

        logger.info("Iniciando generación automática de sesiones (cron job)", { retryCount });

        // Generar sesiones para las próximas 4 semanas
        const result = await generateSessionsForAllTenants(4);

        // Log del resultado
        logger.info("Cron job completado:", {
            tenants: result.total_tenants,
            classes: result.total_classes,
            generated: result.total_generated,
            skipped: result.total_skipped,
            errors: Object.keys(result.errors).length,
            tenantsSucceeded: result.tenants_succeeded,
            tenantsFailed: result.tenants_failed,
            durationMs: Date.now() - startedAt,
        });

        // Si hay errores, logearlos pero no fallar el cron
        if (Object.keys(result.errors).length > 0) {
            logger.error("Errores durante generación:", result.errors);
            // Continuar even with partial errors - most tenants succeeded
        }

        return apiSuccess({
            success: Object.keys(result.errors).length === 0,
            timestamp: new Date().toISOString(),
            result: {
                tenants_processed: result.total_tenants,
                classes_processed: result.total_classes,
                sessions_generated: result.total_generated,
                sessions_skipped: result.total_skipped,
                errors_count: Object.keys(result.errors).length,
                tenants_succeeded: result.tenants_succeeded,
                tenants_failed: result.tenants_failed,
            },
        });
    } catch (error) {
        logger.error("Error en cron job de generación de sesiones:", error, {
            retryCount,
            durationMs: Date.now() - startedAt,
        });

        // Retry logic for transient errors
        if (retryCount < MAX_RETRIES) {
            logger.info(`Reintentando en ${RETRY_DELAY_MS}ms (intento ${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));

            // Create a new request with incremented retry count
            const newRequest = new NextRequest(request.url, {
                headers: new Headers(request.headers),
                method: request.method,
            });
            newRequest.headers.set("x-retry-count", String(retryCount + 1));

            return GET(newRequest);
        }

        logger.error("Max retries exceeded, cron job failed permanently");
        return apiError(
            "CRON_FAILED",
            "Cron job failed",
            500
        );
    }
}
