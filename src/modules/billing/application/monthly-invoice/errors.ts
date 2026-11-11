import {
  OperationalError,
  type OperationalErrorCode,
} from "@/modules/shared/domain/operational-error";

/**
 * 409 OperationalError of monthly invoicing (stale quote, period already
 * invoiced, voided invoice, reference taken, idempotency conflict...).
 *
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function conflict(
  code: OperationalErrorCode,
  detail: string,
  extra?: Record<string, unknown>
) {
  return new OperationalError(code, detail, 409, extra);
}

const DEADLOCK_DETECTED = "40P01";

/**
 * True when a database error (or any error in its cause chain) is a deadlock
 * PostgreSQL resolved by aborting this transaction (SQLSTATE 40P01).
 *
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function isDeadlockDetected(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === DEADLOCK_DETECTED) return true;
    current = candidate.cause;
  }
  return false;
}

/**
 * 503 OperationalError for an issuance PostgreSQL aborted to break a deadlock
 * with another command of the organization (family association, payments,
 * plan changes...). The whole transaction rolled back, so nothing was written:
 * retrying with the same idempotency key either issues the invoice once or
 * replays the one a concurrent retry committed. The status is 5xx on purpose:
 * the owner screen keeps the pending command and its key for any 5xx outside
 * PRE_COMMIT_MONTHLY_INVOICE_REJECTIONS.
 *
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function deadlockRetry() {
  return new OperationalError(
    "CONCURRENCY_RETRY",
    "Otra operación de la academia estaba cambiando a la vez los mismos datos y la emisión se ha cancelado sin guardar nada. Vuelve a intentarlo: se usa la misma operación, así que la cuota no se duplicará.",
    503,
    { retryable: true }
  );
}
