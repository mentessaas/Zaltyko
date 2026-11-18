/**
 * Cobro automático de cuotas (Fase 4, Tarea 7): qué hace Zaltyko con una
 * disputa de tarjeta (`dp_…`) o una devolución del banco en una domiciliación
 * (`du_…`/`dp_…` de un cargo `py_…`). Funciones puras: no tocan la base ni
 * Stripe.
 *
 * Decisiones de Elvis y del coordinador:
 * - D2 (domiciliación devuelta por el banco): la cuota original queda
 *   «devuelta por el banco» (filas `sepa_returned` en zaltyko.refunds) y se
 *   crea una cuota NUEVA pendiente por ese importe, que se cobra a mano con
 *   los recordatorios de siempre. Una domiciliación disputada no se puede
 *   recurrir: se revierte en cuanto se sabe.
 * - D3 (disputa de tarjeta perdida): se marca (filas `dispute_lost`) y se
 *   avisa a la academia. NUNCA se crea una cuota nueva ni deuda automática.
 * - D4 (disputa abierta o ganada): la cuota sigue pagada; la academia ve el
 *   plazo para responder. A la familia no se le enseña nada.
 *
 * Nunca se borra ni se cambia un pago. Una disputa ya revertida no se
 * revierte otra vez. Si después se gana (Stripe devuelve el dinero a la
 * academia), las filas de la reversión se quedan como están: no se deshace
 * nada; la academia recibe el aviso `dispute_reinstated` y lo revisa en su
 * panel de Stripe (lo mismo que `refund_reversed` en las devoluciones).
 */
import { feePeriodLabel } from "@/modules/family-collection/domain/family-failure-notice";

export type DisputePaymentMethodKind = "card" | "sepa_debit" | null;

/** Qué se hace con la disputa en el libro. */
export type DisputeEffect =
  /** Se guarda (estado y plazo) y no se toca el libro. */
  | "track"
  /** Se revierte el cobro: filas `dispute_lost`/`sepa_returned` en zaltyko.refunds. */
  | "reverse"
  /** Cerrada sin perder el dinero (o ya revertida): se guarda el estado final y nada más. */
  | "close";

/** Estados cerrados en los que la academia conserva el dinero. */
const KEPT_STATUSES: ReadonlySet<string> = new Set(["won", "warning_closed", "prevented"]);

/** Estados cerrados (llevan `closed_at`): los de FAMILY_COLLECTION_DISPUTE_CLOSED_STATUSES. */
const FINAL_STATUSES: ReadonlySet<string> = new Set(["won", "lost", "warning_closed", "prevented"]);

/** ¿Es un estado cerrado de Stripe? */
export function isFinalDisputeStatus(status: string): boolean {
  return FINAL_STATUSES.has(status);
}

/**
 * Tabla de efectos:
 * - `lost` → `reverse` (tarjeta o domiciliación);
 * - domiciliación en cualquier estado que no sea ganado → `reverse` (no se
 *   puede recurrir);
 * - `won`, `warning_closed`, `prevented` → `close`;
 * - lo demás (`needs_response`, `under_review`, `warning_needs_response`,
 *   `warning_under_review`) → `track`;
 * - ya revertida → nunca `reverse` otra vez: `close` si el estado es
 *   cerrado, `track` si no.
 */
export function disputeEffect(input: {
  status: string;
  paymentMethodKind: DisputePaymentMethodKind;
  alreadyReversed: boolean;
}): DisputeEffect {
  const kept = KEPT_STATUSES.has(input.status);
  const losesMoney = input.status === "lost" || (input.paymentMethodKind === "sepa_debit" && !kept);
  if (input.alreadyReversed) return isFinalDisputeStatus(input.status) ? "close" : "track";
  if (losesMoney) return "reverse";
  return kept ? "close" : "track";
}

/** Motivo de las filas de la reversión en zaltyko.refunds. */
export const DISPUTE_LOST_REASON = "dispute_lost";
export const SEPA_RETURNED_REASON = "sepa_returned";

/** Motivo de la fila: `sepa_returned` en una domiciliación, `dispute_lost` en tarjeta. */
export function disputeReversalReason(paymentMethodKind: DisputePaymentMethodKind): string {
  return paymentMethodKind === "sepa_debit" ? SEPA_RETURNED_REASON : DISPUTE_LOST_REASON;
}

/**
 * Avisos a la academia (outbox `family_collection.needs_review`, uno por
 * motivo y `dp_…`/`du_…`, C13). Nunca llegan a la familia (D4).
 * - `dispute_opened`: disputa abierta, con el plazo para responder;
 * - `dispute_won`: ganada (la cuota sigue pagada);
 * - `dispute_lost`: perdida en tarjeta (filas `dispute_lost`, sin cuota nueva, D3);
 * - `sepa_returned`: domiciliación devuelta (filas `sepa_returned` y cuota nueva, D2);
 * - `dispute_unallocated`: no cabe en lo repartido (o el cobro no está en el
 *   libro): la disputa se guarda si se puede, sin filas ni cuota nueva;
 * - `dispute_reinstated`: ganada después de haberla anotado como perdida; el
 *   libro no se toca.
 */
export const DISPUTE_OPENED_REASON = "dispute_opened";
export const DISPUTE_WON_REASON = "dispute_won";
export const DISPUTE_LOST_NOTICE_REASON = DISPUTE_LOST_REASON;
export const SEPA_RETURNED_NOTICE_REASON = SEPA_RETURNED_REASON;
export const DISPUTE_UNALLOCATED_REASON = "dispute_unallocated";
export const DISPUTE_REINSTATED_REASON = "dispute_reinstated";

/** Tipo de la línea de la cuota nueva que crea una domiciliación devuelta (D2). */
export const RETURNED_FEE_LINE_TYPE = "returned_fee";

/**
 * Clave de idempotencia de la factura de la cuota nueva:
 * `family-collection-return:{dp_…|du_…}`. Una sola por disputa.
 */
export function returnedFeeInvoiceKey(disputeId: string): string {
  return `family-collection-return:${disputeId}`;
}

/** «Cuota de noviembre de 2026 · devuelta por el banco» (sin periodo legible, «Cuota · devuelta por el banco»). */
export function returnedFeeLabel(servicePeriodStart: string | null): string {
  return `${feePeriodLabel(servicePeriodStart) ?? "Cuota"} · devuelta por el banco`;
}
