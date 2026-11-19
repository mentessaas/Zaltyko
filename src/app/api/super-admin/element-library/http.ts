import { apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Piezas comunes de las rutas del superadministrador para la biblioteca y los
 * avisos (ADR-0029 §8). La autorización la hace siempre `withSuperAdmin` antes
 * de llegar aquí. Las respuestas llevan datos de terceros (nombre y correo de
 * quien avisa): nunca se guardan en caché.
 */

export function noStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

/** Parámetros de consulta: solo los conocidos y cada uno una vez; si no, null. */
export function strictQuery(request: Request, allowed: readonly string[]): Record<string, string> | null {
  const params = new URL(request.url).searchParams;
  const keys = [...params.keys()];
  if (keys.some((key) => !allowed.includes(key) || params.getAll(key).length !== 1)) return null;
  return Object.fromEntries(params.entries());
}

export function invalidQuery(): Response {
  return noStore(apiError("VALIDATION_ERROR", "Parámetros de consulta inválidos", 400));
}

/** Cambios solo desde el propio panel (mismo origen). */
export function crossOrigin(request: Request): Response | null {
  if (hasSameOrigin(request)) return null;
  return noStore(apiError("INVALID_ORIGIN", "Haz el cambio desde el panel de Zaltyko.", 403));
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

/**
 * Solo el tipo y el código del error (por ejemplo, el SQLSTATE de PostgreSQL):
 * el mensaje o el detalle pueden llevar el nombre o el correo de quien avisa.
 */
export function errorSummary(error: unknown): { name: string; code: string | null } {
  const name = error instanceof Error ? error.name : "unknown";
  const withCode = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = typeof withCode?.code === "string" ? withCode.code : typeof withCode?.cause?.code === "string" ? withCode.cause.code : null;
  return { name, code };
}

/** Errores previstos con su estado; cualquier otro, 500 sin detalles y registro mínimo. */
export function failure(error: unknown, fallback: string): Response {
  if (error instanceof OperationalError) {
    return noStore(apiError(error.code, error.message, error.status, error.details));
  }
  logger.error("Error inesperado en la biblioteca o los avisos (superadministrador)", undefined, errorSummary(error));
  return noStore(apiError("INTERNAL_ERROR", fallback, 500));
}
