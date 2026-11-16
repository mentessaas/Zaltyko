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

import { AUTHENTICATION_REQUIRED_CODE } from "./payment-outcome";

/** Días hasta el único reintento de una tarjeta rechazada. */
export const CARD_RETRY_DELAY_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * Fecha del reintento, o `null` si no hay reintento: solo tarjeta, solo tras
 * el primer intento y solo con un rechazo blando.
 */
export function nextRetry(input: {
  kind: "card" | "sepa_debit";
  attemptNumber: number;
  code: string | null;
  declineCode: string | null;
  now: Date;
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
  const now = input.now.getTime();
  if (!Number.isFinite(now)) return null;
  return new Date(now + CARD_RETRY_DELAY_DAYS * DAY_MS);
}
