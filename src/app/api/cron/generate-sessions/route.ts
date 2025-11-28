import { NextRequest, NextResponse } from "next/server";
import { generateSessionsForAllTenants } from "@/lib/generate-class-sessions";
import { logger } from "@/lib/logger";

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
 */
export async function GET(request: NextRequest) {
    try {
        // Verificar que la request viene de Vercel Cron
        const authHeader = request.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            logger.warn("Intento de acceso no autorizado al cron job");
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        logger.info("Iniciando generación automática de sesiones (cron job)");

        // Generar sesiones para las próximas 4 semanas
        const result = await generateSessionsForAllTenants(4);

        // Log del resultado
        logger.info("Cron job completado:", {
            tenants: result.total_tenants,
            classes: result.total_classes,
            generated: result.total_generated,
            skipped: result.total_skipped,
            errors: Object.keys(result.errors).length,
        });

        // Si hay errores, logearlos pero no fallar el cron
        if (Object.keys(result.errors).length > 0) {
            logger.error("Errores durante generación:", result.errors);
        }

        return NextResponse.json({
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
        logger.error("Error fatal en cron job de generación de sesiones:", error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}
