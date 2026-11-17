/**
 * Cobro automático de cuotas (Fase 3): qué hacer cuando Stripe no deja leer
 * (o cancelar) un cobro. Función pura: no importa tipos de stripe-node.
 *
 * - Permanente: reintentar no cambia nada y hace falta una persona (soporte
 *   de Stripe). Stripe dice que el cobro no existe (`resource_missing`), que
 *   la plataforma ya no tiene permiso sobre la cuenta de la academia
 *   (`StripePermissionError`, HTTP 403) o que esa cuenta ya no es válida
 *   (`account_invalid`: la academia la cerró o la desconectó).
 * - Pasajero: todo lo demás (red, límite de peticiones, error interno de
 *   Stripe…). Se vuelve a intentar más tarde.
 *
 * stripe-node 22 lanza sus errores con `type` = nombre de la clase
 * (`StripePermissionError`, `StripeInvalidRequestError`…), `rawType` = tipo
 * de la API (`invalid_request_error`…) y `code` = código de la API
 * (`resource_missing`, `account_invalid`…).
 *
 * Para el registro solo se devuelven el nombre y el código del error: nunca
 * su mensaje (puede llevar datos del banco o de la cuenta).
 */

/**
 * Error propio del adaptador: la búsqueda de los cobros de un intento tiene
 * más de una página. Siempre saldrá igual (no es pasajero): lo resuelve soporte.
 */
export const TOO_MANY_PAYMENTS_FOR_ATTEMPT_ERROR = "FAMILY_COLLECTION_TOO_MANY_PAYMENTS_FOR_ATTEMPT";

/** ¿Es el error de «demasiados cobros para un intento» (TOO_MANY_PAYMENTS_FOR_ATTEMPT_ERROR)? */
export function isTooManyPaymentsError(error: unknown): boolean {
  return error instanceof Error && error.message === TOO_MANY_PAYMENTS_FOR_ATTEMPT_ERROR;
}

const PERMANENT_CODES: ReadonlySet<string> = new Set(["resource_missing", "account_invalid"]);
const PERMANENT_TYPES: ReadonlySet<string> = new Set(["StripePermissionError", "permission_error"]);

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const CODE_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
/** Errores propios del adaptador (`FAMILY_COLLECTION_…`): el mensaje es un código. */
const INTERNAL_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,80}$/;

export interface StripeReadFailure {
  /** Clase del error de Stripe (`StripePermissionError`…) o nombre del error. */
  errorName: string;
  /** Código de Stripe (`resource_missing`…) o código interno; `null` si no hay. */
  errorCode: string | null;
  /** `true` si reintentar no lo va a arreglar. */
  permanent: boolean;
}

export function stripeReadFailureOf(error: unknown): StripeReadFailure {
  const fields =
    typeof error === "object" && error !== null
      ? (error as { type?: unknown; rawType?: unknown; code?: unknown })
      : {};
  const type = typeof fields.type === "string" && NAME_PATTERN.test(fields.type) ? fields.type : null;
  const rawType = typeof fields.rawType === "string" ? fields.rawType : null;
  const code = typeof fields.code === "string" && CODE_PATTERN.test(fields.code) ? fields.code : null;
  const name = type ?? (error instanceof Error && NAME_PATTERN.test(error.name) ? error.name : "unknown");
  const internal = error instanceof Error && INTERNAL_CODE_PATTERN.test(error.message) ? error.message : null;
  const permanent =
    (type !== null && PERMANENT_TYPES.has(type)) ||
    (rawType !== null && PERMANENT_TYPES.has(rawType)) ||
    (code !== null && PERMANENT_CODES.has(code));
  return { errorName: name, errorCode: code ?? internal, permanent };
}

/** ¿El error de Stripe es de los que no se arreglan reintentando? */
export function isPermanentStripeError(error: unknown): boolean {
  return stripeReadFailureOf(error).permanent;
}
