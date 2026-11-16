/**
 * Cobro automático de cuotas (Fase 3): ¿se vuelve a intentar un cobro que
 * falló? Decisión de Elvis (P3, 16-11-2026): tarjeta rechazada, un reintento a
 * los 3 días; domiciliación, ninguno. Después, cobro a mano con recordatorios.
 *
 * Solo se reintenta un rechazo «blando» (el banco puede aceptarlo otro día).
 * Nunca cuando la tarjeta está perdida o robada, es fraude, el banco pide no
 * repetir o retener la tarjeta (repetir no sirve y puede alertar al banco), ni
 * cuando el banco pide autenticación (la persona tiene que confirmar el pago;
 * la Fase 4 lo hará recuperable). Función pura.
 */

import { addLocalDays, localCalendarDate, startOfLocalDay } from "./collection-plan";
import { AUTHENTICATION_REQUIRED_CODE } from "./payment-outcome";

/** Días de calendario (locales de la sede) hasta el único reintento de una tarjeta rechazada. */
export const CARD_RETRY_DELAY_DAYS = 3;

/**
 * Rechazos blandos de tarjeta que se reintentan una vez. Se compara con el
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

/** Rechazos con los que nunca se reintenta, vengan como `code` o `decline_code`. */
export const NEVER_RETRY_DECLINE_CODES: readonly string[] = [
  "lost_card",
  "stolen_card",
  "fraudulent",
  "do_not_try_again",
  "pickup_card",
  AUTHENTICATION_REQUIRED_CODE,
];

const SOFT = new Set(SOFT_DECLINE_CODES);
const NEVER = new Set(NEVER_RETRY_DECLINE_CODES);

/**
 * Instante del reintento, o `null` si no hay reintento: solo tarjeta, solo
 * tras el primer intento y solo con un rechazo blando.
 *
 * El reintento es el día local de la sede «hoy + 3», no 72 horas después: se
 * devuelve el primer instante de ese día en `timezone` (las 00:00 locales,
 * con el cambio de hora resuelto). Como el proceso diario reintenta cuando
 * `next_retry_at <= now` (Tarea 5), el reintento sale en la ejecución de ese
 * día local, sea cual sea la hora a la que falló el primer intento.
 */
export function nextRetry(input: {
  kind: "card" | "sepa_debit";
  attemptNumber: number;
  code: string | null;
  declineCode: string | null;
  now: Date;
  /** Zona horaria de la sede (`locations.timezone`). */
  timezone: string;
}): Date | null {
  if (input.kind !== "card") return null;
  if (input.attemptNumber !== 1) return null;
  if (
    (input.code !== null && NEVER.has(input.code)) ||
    (input.declineCode !== null && NEVER.has(input.declineCode))
  ) {
    return null;
  }
  const reason = input.declineCode ?? input.code;
  if (reason === null || !SOFT.has(reason)) return null;
  if (!Number.isFinite(input.now.getTime())) return null;
  const today = localCalendarDate(input.now, input.timezone);
  return startOfLocalDay(addLocalDays(today, CARD_RETRY_DELAY_DAYS), input.timezone);
}
