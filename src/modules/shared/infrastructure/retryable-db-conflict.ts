import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Errores de PostgreSQL tras los que la transacción se deshizo entera y basta
 * con reintentar la misma orden: interbloqueo (40P01), fallo de serialización
 * (40001) y cerrojo no disponible (55P03). Drizzle envuelve el error original
 * en `cause`, así que se recorre la cadena.
 */
const RETRYABLE_DB_CONFLICT_CODES = new Set(["40P01", "40001", "55P03"]);

function postgresCode(error: unknown): string | null {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export function isRetryableDbConflict(error: unknown): boolean {
  const code = postgresCode(error);
  return code !== null && RETRYABLE_DB_CONFLICT_CODES.has(code);
}

/**
 * 409 reintentable, nunca 500: la orden no se aplicó y se puede repetir con la
 * misma clave. Usa el código CONCURRENCY_RETRY (título «Operación ocupada,
 * vuelve a intentarlo»).
 *
 * Dos estados para el mismo código, a propósito:
 * - 409 aquí, para Pasar lista y la asignación de entrenadoras. Sus clientes
 *   tratan este 409 como no definitivo: conservan el reintento con la misma
 *   clave (isRetryableAttendanceConflict, OwnerClassCoaches/OwnerSessionCoaches).
 * - 503 en la emisión mensual (monthly-invoice/errors.ts, deadlockRetry). Su
 *   gestor trata cualquier 4xx del primer intento como rechazo definitivo y
 *   descarta la orden pendiente; un 409 allí perdería la clave de reintento.
 * NO usar este helper en la emisión mensual sin revisar antes ese gestor: lo
 * impide tests/retryable-db-conflict.test.ts.
 */
export function retryableDbConflictError(message: string): OperationalError {
  return new OperationalError("CONCURRENCY_RETRY", message, 409, { retryable: true });
}
