/**
 * Cobro automático de cuotas (Fase 4): códigos del cobro tardío, el de un
 * intento ya cerrado (`failed` o `canceled`) que Stripe completa después.
 * Solo constantes: las usan el almacén, la relectura diaria y los eventos. El
 * almacén las vuelve a exportar (family-collection-store.ts).
 */

/**
 * D10: un cobro antiguo de la factura se completó tarde cuando la cuota ya
 * estaba cobrada (por otro intento o a mano). El tardío no se registra; la
 * academia recibe este aviso para devolver uno desde su panel de Stripe.
 */
export const DUPLICATE_COLLECTION_REASON = "duplicate_collection";

/**
 * Motivo (`failure_code`) con el que se cierra un intento hermano abierto
 * cuyo cobro se canceló en Stripe porque otro cobro de la misma factura se
 * completó tarde.
 */
export const LATE_SUCCESS_ELSEWHERE_CODE = "late_success_elsewhere";

/**
 * Error con el que se para el registro de un cobro tardío mientras la factura
 * tiene un intento `claimed` sin `pi_…` (el proceso diario lo está creando
 * ahora mismo; se resuelve en segundos). El evento queda `failed` y Stripe lo
 * reenvía; en el reenvío el hermano ya tiene `pi_…` y se cancela antes.
 */
export const LATE_SUCCESS_SIBLING_IN_FLIGHT = "LATE_SUCCESS_SIBLING_IN_FLIGHT";

/**
 * Aviso a la academia, y marca duradera en el intento tardío, cuando la
 * factura tiene otro cobro abierto que Stripe no deja cancelar (una
 * domiciliación que el banco aún no ha resuelto) o que no se puede leer. La
 * relectura diaria vuelve a mirar esos intentos hasta que el tardío queda
 * registrado o con el aviso `duplicate_collection`.
 */
export const LATE_SUCCESS_PENDING_REASON = "late_success_pending";
