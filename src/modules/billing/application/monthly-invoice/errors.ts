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
