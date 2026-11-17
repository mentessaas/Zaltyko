/**
 * Cobro automático de cuotas (Fase 3): ¿se vuelve a intentar un cobro que
 * falló? Decisión de Elvis (D1, 17-11-2026, sustituye a «un reintento a los 3
 * días»): tarjeta rechazada, hasta 3 reintentos, a 1, 3 y 7 días del primer
 * intento; domiciliación, ninguno. Tras el último fallo, cobro a mano con
 * recordatorios.
 *
 * Solo se reintenta un rechazo «blando» (límite de gasto o de operaciones,
 * fondos insuficientes, rechazo genérico o temporal: el banco puede aceptarlo
 * otro día). Nunca cuando la tarjeta está perdida o robada, es fraude, el
 * banco pide no repetir o retener la tarjeta (repetir no sirve y puede alertar
 * al banco), cuando el banco pide autenticación (la persona tiene que
 * confirmar el pago; la Fase 4 lo hará recuperable) ni cuando el método no es
 * válido (caducada, número incorrecto, tarjeta no admitida…). Función pura.
 */

import { addLocalDays, localCalendarDate, startOfLocalDay } from "./collection-plan";
import { AUTHENTICATION_REQUIRED_CODE } from "./payment-outcome";

/**
 * Días de calendario (locales de la sede), contados desde el día del primer
 * intento, de cada reintento de una tarjeta rechazada: el intento 2 sale el
 * día +1, el 3 el día +3 y el 4 el día +7.
 */
export const CARD_RETRY_OFFSET_DAYS: readonly number[] = [1, 3, 7];

/** Intentos de tarjeta como mucho por cuota: el primero y sus reintentos. */
export const CARD_MAX_ATTEMPTS = 1 + CARD_RETRY_OFFSET_DAYS.length;

/**
 * Rechazos blandos de tarjeta que se reintentan. Se compara con el
 * `decline_code` y, si no lo hay, con el `code` (p. ej. `processing_error`).
 */
export const SOFT_DECLINE_CODES: readonly string[] = [
  "approve_with_id",
  "card_velocity_exceeded",
  "do_not_honor",
  "generic_decline",
  "insufficient_funds",
  "issuer_not_available",
  "processing_error",
  "reenter_transaction",
  "try_again_later",
  "withdrawal_count_limit_exceeded",
];

/**
 * Rechazos con los que nunca se reintenta, vengan como `code` o
 * `decline_code`: mandan sobre un blando que venga en el otro campo.
 */
export const NEVER_RETRY_DECLINE_CODES: readonly string[] = [
  // Tarjeta perdida, robada o retenida; fraude; el banco pide no repetir.
  "lost_card",
  "stolen_card",
  "fraudulent",
  "merchant_blacklist",
  "do_not_try_again",
  "pickup_card",
  // El banco pide autenticación (3DS).
  AUTHENTICATION_REQUIRED_CODE,
  // Método no válido: repetir con la misma tarjeta no sirve.
  "expired_card",
  "incorrect_number",
  "invalid_number",
  "invalid_account",
  "card_not_supported",
];

const SOFT = new Set(SOFT_DECLINE_CODES);
const NEVER = new Set(NEVER_RETRY_DECLINE_CODES);

/**
 * Instante del siguiente reintento, o `null` si no hay más: solo tarjeta,
 * solo tras los intentos 1, 2 y 3 y solo con un rechazo blando.
 *
 * Las fechas se cuentan siempre desde el día local (zona de la sede) en que se
 * reclamó el primer intento (`firstAttemptClaimedAt`), no desde hoy ni desde
 * el intento anterior: tras el intento N, el día «primero + CARD_RETRY_OFFSET_DAYS[N-1]».
 * Se devuelve el primer instante de ese día en `timezone` (las 00:00 locales,
 * con el cambio de hora resuelto), no 24 horas por día: como el proceso diario
 * reintenta cuando la fecha local de `next_retry_at` ya llegó, el reintento
 * sale en la ejecución de ese día local, sea cual sea la hora del fallo.
 *
 * Si ese día ya llegó (el intento salió tarde, p. ej. el proceso diario no
 * corrió unos días), el reintento pasa a mañana: nunca dos cobros a la misma
 * tarjeta el mismo día. Cada reintento tiene después su propia ventana de
 * cobro, contada desde su fecha.
 */
export function nextRetry(input: {
  kind: "card" | "sepa_debit";
  attemptNumber: number;
  code: string | null;
  declineCode: string | null;
  /** `claimed_at` del intento 1 de la factura. */
  firstAttemptClaimedAt: Date;
  now: Date;
  /** Zona horaria de la sede (`locations.timezone`). */
  timezone: string;
}): Date | null {
  if (input.kind !== "card") return null;
  if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) return null;
  const offset = CARD_RETRY_OFFSET_DAYS[input.attemptNumber - 1];
  if (offset === undefined) return null;
  if (
    (input.code !== null && NEVER.has(input.code)) ||
    (input.declineCode !== null && NEVER.has(input.declineCode))
  ) {
    return null;
  }
  const reason = input.declineCode ?? input.code;
  if (reason === null || !SOFT.has(reason)) return null;
  if (!Number.isFinite(input.now.getTime()) || !Number.isFinite(input.firstAttemptClaimedAt.getTime())) {
    return null;
  }
  const firstDay = localCalendarDate(input.firstAttemptClaimedAt, input.timezone);
  const today = localCalendarDate(input.now, input.timezone);
  const scheduled = addLocalDays(firstDay, offset);
  const day = scheduled > today ? scheduled : addLocalDays(today, 1);
  return startOfLocalDay(day, input.timezone);
}
