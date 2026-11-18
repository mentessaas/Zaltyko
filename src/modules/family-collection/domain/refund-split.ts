/**
 * Cobro automático de cuotas (Fase 4): cómo se reparte en el libro una
 * devolución que la academia hizo desde su panel de Stripe (D5) o una
 * disputa perdida (Tarea 7). Funciones puras: no tocan la base ni Stripe.
 *
 * Reglas:
 * - Nunca se borra ni se cambia un pago ni un reparto: devolver es escribir
 *   filas en `zaltyko.refunds`, una por reparto (`payment_allocations`).
 * - La cuota sigue pagada (D1): la devolución no la reabre.
 * - Nunca se devuelve más de lo que queda en un reparto (lo repartido menos
 *   lo ya devuelto). Si la devolución no cabe entera, no se escribe ninguna
 *   fila: la academia recibe un aviso y el evento queda procesado.
 */

/** Un reparto del pago a una cuota, con lo que ya se devolvió de él. */
export interface RefundableAllocation {
  allocationId: string;
  /** Primer día del periodo de la cuota (YYYY-MM-DD): marca la más antigua. */
  servicePeriodStart: string;
  chargeId: string;
  allocatedCents: number;
  refundedCents: number;
}

/** Parte de la devolución que va a un reparto. */
export interface RefundPart {
  allocationId: string;
  amountCents: number;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Reparte una devolución de la cuota más antigua a la más nueva (por periodo;
 * a igual periodo, por id de la cuota y después del reparto), sin pasar nunca
 * de lo que queda en cada reparto. `null` si no cabe entera (o si el importe
 * no es un entero positivo): entonces no se escribe nada.
 */
export function splitRefund(input: { allocations: RefundableAllocation[]; amountCents: number }): RefundPart[] | null {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) return null;
  const ordered = [...input.allocations].sort(
    (left, right) =>
      compareText(left.servicePeriodStart, right.servicePeriodStart) ||
      compareText(left.chargeId, right.chargeId) ||
      compareText(left.allocationId, right.allocationId)
  );
  const parts: RefundPart[] = [];
  let pending = input.amountCents;
  for (const allocation of ordered) {
    if (pending === 0) break;
    const remaining = Math.max(0, allocation.allocatedCents - Math.max(0, allocation.refundedCents));
    const amountCents = Math.min(remaining, pending);
    if (amountCents <= 0) continue;
    parts.push({ allocationId: allocation.allocationId, amountCents });
    pending -= amountCents;
  }
  return pending === 0 ? parts : null;
}

/**
 * Referencia de la fila en `refunds.provider_refund_id`: la de Stripe más el
 * reparto. Un mismo `re_…` puede tocar varias cuotas y `refunds_provider_uq`
 * es único, así que cada fila lleva la suya.
 */
export function providerRefundReference(refundId: string, allocationId: string): string {
  return `${refundId}:${allocationId}`;
}

/**
 * Clave de idempotencia de la fila (`refunds_idempotency_uq`, única por
 * academia): `refund:{re_|pyr_|dp_|du_}:{reparto}`. Una por fila, nunca una
 * por evento (con varias filas por evento chocaría).
 */
export function providerRefundIdempotencyKey(reference: string, allocationId: string): string {
  return `refund:${reference}:${allocationId}`;
}

/** Código del error con el que se deshace una devolución que no cabe en lo repartido. */
export const REFUND_DOES_NOT_FIT = "REFUND_DOES_NOT_FIT";

/**
 * La devolución (o la disputa perdida) no cabe en lo repartido del pago: el
 * pago no está repartido, solo lo está en parte o las devoluciones anteriores
 * ya lo agotan. Se lanza dentro de la transacción para deshacerla entera (no
 * queda ninguna fila) y quien llama deja el aviso a la academia.
 */
export class RefundDoesNotFitError extends Error {
  readonly code = REFUND_DOES_NOT_FIT;

  constructor() {
    super(REFUND_DOES_NOT_FIT);
    this.name = "RefundDoesNotFitError";
  }
}

/**
 * Avisos a la academia de las devoluciones (outbox
 * `family_collection.needs_review`, uno por `re_…`/`pyr_…`, C13):
 * - `refunded`: informativo, la devolución quedó anotada (la cuota sigue pagada);
 * - `refund_unallocated`: no cabe en lo repartido; no se escribió nada;
 * - `refund_reversed`: una devolución ya anotada falló o se canceló en Stripe;
 *   el libro no se toca.
 */
export const REFUNDED_NOTICE_REASON = "refunded";
export const REFUND_UNALLOCATED_REASON = "refund_unallocated";
export const REFUND_REVERSED_REASON = "refund_reversed";

/** Motivo de la fila cuando Stripe no da uno (la academia devolvió desde su panel). */
export const REFUND_REASON_BY_ACADEMY = "requested_by_academy";

const REASON_PATTERN = /^[a-z0-9_]{1,64}$/;

/** Motivo de Stripe (`duplicate`, `requested_by_customer`…) o, si no hay o no es un código, el de la academia. */
export function refundReasonCode(reason: string | null): string {
  return reason !== null && REASON_PATTERN.test(reason) ? reason : REFUND_REASON_BY_ACADEMY;
}
