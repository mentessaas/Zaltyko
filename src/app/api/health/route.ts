import { sql } from "drizzle-orm";

import { db } from "@/db";
import { apiError, apiSuccess } from "@/lib/api-response";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Tope de la comprobación de base de datos. El pool tarda hasta 10 s en
 * rendirse al conectar y 30 s por sentencia; un monitor externo necesita una
 * respuesta rápida y acotada, así que a los 2 s la ruta responde 503 aunque la
 * consulta siga en curso en segundo plano.
 */
const DATABASE_CHECK_TIMEOUT_MS = 2_000;

/** Ni la CDN ni el navegador pueden servir una señal de salud antigua. */
const HEALTH_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

class DatabaseCheckTimeoutError extends Error {
  constructor() {
    super("Database health check timed out");
    this.name = "DatabaseCheckTimeoutError";
  }
}

async function withTimeout<T>(run: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DatabaseCheckTimeoutError()), timeoutMs);
  });
  try {
    // Promise.race se suscribe a ambas promesas: un rechazo tardío de la
    // consulta perdedora queda gestionado y no genera unhandledRejection.
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

/**
 * @route-auth public
 *
 * Readiness para el monitor externo: 200 si la app atiende y PostgreSQL
 * responde a `select 1` en menos de 2 s; 503 en cualquier otro caso.
 * Sin sesión, sin rate limit (GET fuera de /api/public) y sin datos
 * personales. No expone proveedor, host, versión ni el error de la base de
 * datos: el detalle va solo al logger (y de ahí a Sentry).
 * La liveness sin base de datos vive en /api/health/live.
 */
export async function GET() {
  const startedAt = performance.now();

  try {
    await withTimeout(() => db.execute(sql`select 1`), DATABASE_CHECK_TIMEOUT_MS);
    const latencyMs = elapsedMs(startedAt);

    const response = apiSuccess({
      status: "ok",
      checks: {
        database: { status: "ok", latencyMs },
        // No exponemos valores ni nombres de secretos; esta señal permite al
        // monitor distinguir una app viva de una instalación sin cron seguro.
        cronAuth: { status: process.env.CRON_SECRET ? "ok" : "missing" },
      },
      timestamp: new Date().toISOString(),
    });
    for (const [header, value] of Object.entries(HEALTH_HEADERS)) {
      response.headers.set(header, value);
    }
    return response;
  } catch (error) {
    const latencyMs = elapsedMs(startedAt);
    const timedOut = error instanceof DatabaseCheckTimeoutError;
    logger.error("Health check failed", error, {
      check: "database",
      outcome: timedOut ? "timeout" : "failed",
      latencyMs,
    });

    return apiError(
      "HEALTH_CHECK_FAILED",
      "Service health check failed",
      503,
      {
        status: "degraded",
        checks: { database: { status: timedOut ? "timeout" : "failed", latencyMs } },
        timestamp: new Date().toISOString(),
      },
      { headers: HEALTH_HEADERS }
    );
  }
}
