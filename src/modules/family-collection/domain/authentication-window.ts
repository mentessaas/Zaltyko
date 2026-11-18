/**
 * Cobro automático de cuotas (Fase 4): plazo para que la familia confirme el
 * pago con su banco (estado `requires_action` del intento).
 *
 * D7 (coordinador, 18-11-2026): la espera es la misma ventana de 3 días que
 * ya usan los recordatorios (AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS) y se
 * cuenta desde la misma fecha que la ventana máxima de cobro
 * (`collectionWindowExpired`, family-collection-collect.ts):
 * - intento 1: la fecha de cobro prevista más antigua de sus cuotas;
 * - reintento: la fecha local del reintento (`next_retry_at` del intento
 *   anterior).
 * Nunca desde `claimed_at`: si el proceso diario reclama tarde, la familia no
 * gana días frente a los recordatorios. El plazo acaba al final del último
 * día en que `withinGrace` (reminder-policy.ts) aún retiene los recordatorios.
 *
 * Funciones puras: sin base de datos ni Stripe.
 */
import { AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS } from "@/modules/payment-reminders/domain/reminder-policy";

import { addLocalDays, collectionDate, localCalendarDate, startOfLocalDay } from "./collection-plan";

/**
 * Código (`failure_code`) del intento `requires_action` cuyo plazo pasó sin
 * que la familia confirmara el pago: se cierra `failed`, sin reintento, y la
 * cuota vuelve a los recordatorios. Es el mismo código que la autenticación
 * pedida de la Fase 3 (AUTHENTICATION_REQUIRED_CODE de payment-outcome.ts).
 */
export const AUTHENTICATION_EXPIRED_CODE = "authentication_required";

/** Lo mínimo que hace falta del intento anterior de la factura. */
export interface WindowPreviousAttempt {
  status: string;
  nextRetryAt: Date | null;
}

/**
 * Fecha local (YYYY-MM-DD) desde la que se cuenta la ventana de cobro de un
 * intento, o `null` si no tiene:
 * - con intento anterior: la fecha local de su reintento, solo si es un
 *   fallo con reintento programado (si no, el intento no es un reintento y no
 *   hay ventana: `collectionWindowExpired` nunca la da por pasada);
 * - sin intento anterior: la fecha de cobro prevista más antigua de las
 *   cuotas del reparto (`collectionDate`).
 */
export function collectionWindowAnchor(input: {
  previousAttempt: WindowPreviousAttempt | null;
  charges: readonly { id: string; dueAt: Date | string }[];
  allocations: readonly { chargeId: string }[];
  timezone: string;
  collectionDayOfMonth: number | null;
}): string | null {
  const previous = input.previousAttempt;
  if (previous) {
    if (previous.status !== "failed" || !previous.nextRetryAt) return null;
    return localCalendarDate(previous.nextRetryAt, input.timezone);
  }
  const planned = new Set(input.allocations.map((allocation) => allocation.chargeId));
  const earliest = input.charges
    .filter((charge) => planned.has(charge.id))
    .map((charge) =>
      collectionDate({
        dueDateLocal: localCalendarDate(charge.dueAt, input.timezone),
        collectionDayOfMonth: input.collectionDayOfMonth,
      })
    )
    .sort()[0];
  return earliest ?? null;
}

/**
 * Plazo para confirmar el pago: el último instante (23:59:59,999 locales)
 * del día `anchorLocalDate + AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS` en la
 * zona de la sede, que es el último día en que `withinGrace` retiene los
 * recordatorios. Con el cambio de hora resuelto (startOfLocalDay).
 */
export function authenticationDeadline(input: { anchorLocalDate: string; timezone: string }): Date {
  const nextDay = addLocalDays(input.anchorLocalDate, AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS + 1);
  return new Date(startOfLocalDay(nextDay, input.timezone).getTime() - 1);
}

/** ¿Pasó ya el plazo? Sin plazo conocido, sí: ninguna cuota se queda esperando para siempre. */
export function isAuthenticationDeadlinePassed(deadline: Date | null, now: Date): boolean {
  if (deadline === null || !Number.isFinite(deadline.getTime())) return true;
  return now.getTime() > deadline.getTime();
}
