/**
 * Política de recordatorios: quién puede recibir uno y cuándo. Pura.
 *
 * Reglas:
 * - Solo se escribe al tutor pagador de la cuota (RGPD, minimización): sin
 *   tutor pagador o sin correo del tutor no se envía a nadie más.
 * - Como máximo un recordatorio por cuota cada `minIntervalDays` días. Cuentan
 *   los enviados, las reservas de menos de PENDING_WINDOW_MINUTES (bloquean
 *   mientras el envío está en curso) y también las reservas que caducaron sin
 *   resolverse, que se tratan como enviadas porque el correo pudo salir. Solo
 *   un envío marcado como fallido no cuenta y se puede reintentar.
 * - El recordatorio automático es opcional, llega `autoAfterDays` días después
 *   del vencimiento y es único: nunca se envía si la cuota ya recibió alguno.
 * - Una cuota que se cobra sola (cobro automático, Fase 3) no recibe
 *   recordatorios mientras su cobro siga pendiente (automaticCollectionHolds).
 */
import { addLocalDays } from "@/modules/family-collection/domain/collection-plan";

export const DEFAULT_MIN_INTERVAL_DAYS = 7;
export const MIN_INTERVAL_DAYS_RANGE = { min: 1, max: 90 } as const;
export const DEFAULT_AUTO_AFTER_DAYS = 3;
export const AUTO_AFTER_DAYS_RANGE = { min: 1, max: 60 } as const;
/**
 * Una reserva sin respuesta del proveedor deja de bloquear «en curso» pasado
 * este tiempo y pasa a contar como enviada para el límite de días.
 */
export const PENDING_WINDOW_MINUTES = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReminderOrigin = "manual" | "automatic";

export type ReminderSkipReason =
  | "settled"
  | "no_payer"
  | "no_email"
  | "recently_reminded"
  | "in_progress"
  | "not_overdue_yet"
  | "already_reminded"
  | "automatic_collection";

export const SKIP_REASON_LABELS: Record<ReminderSkipReason, string> = {
  settled: "Ya no tiene saldo pendiente",
  no_payer: "Falta la persona pagadora",
  no_email: "A la persona pagadora le falta el correo",
  recently_reminded: "Ya se recordó hace poco",
  in_progress: "Hay un envío en curso",
  not_overdue_yet: "Todavía no ha vencido",
  already_reminded: "Ya recibió un recordatorio",
  automatic_collection: "Se cobrará automáticamente",
};

export interface ReminderCandidateState {
  now: Date;
  dueAt: Date;
  outstandingCents: number;
  hasPayer: boolean;
  hasEmail: boolean;
  /** Último envío aceptado por el proveedor. */
  lastSentAt: Date | null;
  sentCount: number;
  /** Hay una reserva sin resolver de hace menos de PENDING_WINDOW_MINUTES. */
  hasPendingReservation: boolean;
  minIntervalDays: number;
  origin: ReminderOrigin;
  autoAfterDays: number;
  /** La cuota se está cobrando sola (automaticCollectionHolds). */
  automaticCollectionHold: boolean;
}

export type ReminderDecision = { eligible: true } | { eligible: false; reason: ReminderSkipReason };

/**
 * Días tras la fecha de cobro prevista en los que una cuota automática sin
 * ningún intento sigue esperando al cobro. Pasados, se trata como manual: si
 * la puerta del cobro falla día tras día por un motivo pasajero (cuenta o plan
 * por releer), la cuota no se queda sin cobro y sin recordatorio.
 */
export const AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS = 3;

/** Último intento de cobro automático de la factura de la cuota. */
export interface AutomaticCollectionLastAttempt {
  status: string;
  /** `failed` con reintento programado. */
  retryPending: boolean;
}

/**
 * ¿Espera la cuota a su cobro automático (sin recordatorios)? Solo si es
 * `automatic`, el cobro automático está abierto (bandera, cerrojos y tablas)
 * y su factura no tiene todavía un intento final:
 * - sin intento: hasta AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS días después de
 *   la fecha de cobro prevista (`collectionDateLocal`, en la zona de la sede);
 * - intento en curso (`claimed`, `created`, `processing`) o fallido con
 *   reintento pendiente: espera;
 * - cobrado (`succeeded`): espera; si el reparto no cuadró, la academia ya
 *   tiene un aviso para revisarlo y no se pide a la familia que pague otra vez;
 * - fallo final (`failed` sin reintento) o cancelado (por la puerta, la
 *   academia, un pago manual o una revisión): vuelve a los recordatorios.
 * Con la bandera apagada, las cuotas automáticas se tratan como manuales.
 */
export function automaticCollectionHolds(input: {
  collectionMode: "manual" | "automatic";
  automaticCollectionOpen: boolean;
  lastAttempt: AutomaticCollectionLastAttempt | null;
  collectionDateLocal: string;
  todayLocal: string;
}): boolean {
  if (input.collectionMode !== "automatic" || !input.automaticCollectionOpen) return false;
  const last = input.lastAttempt;
  if (last === null) {
    return input.todayLocal <= addLocalDays(input.collectionDateLocal, AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS);
  }
  if (last.status === "canceled") return false;
  if (last.status === "failed") return last.retryPending;
  return true;
}

export function isOverdue(dueAt: Date, now: Date): boolean {
  return dueAt.getTime() < now.getTime();
}

export function nextEligibleAt(lastSentAt: Date | null, minIntervalDays: number): Date | null {
  return lastSentAt ? new Date(lastSentAt.getTime() + minIntervalDays * DAY_MS) : null;
}

export function evaluateReminder(state: ReminderCandidateState): ReminderDecision {
  if (state.outstandingCents <= 0) return { eligible: false, reason: "settled" };
  if (state.automaticCollectionHold) return { eligible: false, reason: "automatic_collection" };
  if (!state.hasPayer) return { eligible: false, reason: "no_payer" };
  if (!state.hasEmail) return { eligible: false, reason: "no_email" };
  if (state.hasPendingReservation) return { eligible: false, reason: "in_progress" };

  if (state.origin === "automatic") {
    if (state.sentCount > 0) return { eligible: false, reason: "already_reminded" };
    const threshold = state.dueAt.getTime() + state.autoAfterDays * DAY_MS;
    if (state.now.getTime() < threshold) return { eligible: false, reason: "not_overdue_yet" };
  }

  const next = nextEligibleAt(state.lastSentAt, state.minIntervalDays);
  if (next && state.now.getTime() < next.getTime()) return { eligible: false, reason: "recently_reminded" };
  return { eligible: true };
}

/**
 * Clave estable del correo para el emisor común: la misma cuota (o conjunto de
 * cuotas) en el mismo periodo del límite produce siempre la misma clave, así
 * que un reintento tras un corte o una carrera no duplica el correo aunque la
 * reserva se haya perdido. El periodo es la ventana de `minIntervalDays` días
 * en la que cae `now`. Como el emisor común no reutiliza una clave ya usada
 * (ni siquiera la de un intento fallido), `failedAttempts` la renueva tras cada
 * fallo confirmado y permite reintentar. `sha256` lo aporta el llamador (el
 * dominio no importa node).
 */
export function reminderDedupeKey(
  chargeIds: readonly string[],
  minIntervalDays: number,
  now: Date,
  failedAttempts: number,
  sha256: (value: string) => string
): string {
  const window = Math.floor(now.getTime() / (minIntervalDays * DAY_MS));
  const digest = sha256([...chargeIds].sort().join(","));
  return `payment-reminder:${digest.slice(0, 40)}:${window}:${failedAttempts}`;
}

export function clampInterval(value: number): number {
  return Math.min(MIN_INTERVAL_DAYS_RANGE.max, Math.max(MIN_INTERVAL_DAYS_RANGE.min, Math.trunc(value)));
}
