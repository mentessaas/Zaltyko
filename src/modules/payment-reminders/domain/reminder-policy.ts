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
 *   Si su cobro ya está en marcha, tampoco con la bandera apagada. Si el
 *   pagador paga por domiciliación y la domiciliación todavía no se cobra
 *   sola, la cuota recibe recordatorios como una manual.
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
 * Días de espera de una cuota automática antes de volver a los recordatorios
 * cuando el cobro no avanza: desde la fecha de cobro prevista si no tiene
 * ningún intento, desde la fecha del reintento si ese reintento no llega, y
 * desde el cobro si después de cobrarse sigue debiendo algo. Así ninguna
 * cuota se queda sin cobro y sin recordatorio (p. ej. si la puerta falla día
 * tras día por un motivo pasajero).
 */
export const AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS = 3;

/** Último intento de cobro automático de la factura de la cuota (fechas locales de la sede). */
export interface AutomaticCollectionLastAttempt {
  status: string;
  /** Fecha local (YYYY-MM-DD) del reintento programado, o null si no hay reintento. */
  retryDateLocal: string | null;
  /** Fecha local en que terminó el intento (`completed_at`), o null. */
  completedDateLocal: string | null;
}

/**
 * ¿Hoy sigue dentro de la espera que empezó en `fromLocal`? También la usan
 * las pantallas del cobro automático (family-collection-reads.ts) para no
 * prometer un cobro que ya no va a llegar.
 */
export function withinGrace(fromLocal: string, todayLocal: string): boolean {
  return todayLocal <= addLocalDays(fromLocal, AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS);
}

/**
 * Estados de un intento de cobro automático en marcha: el dinero puede estar
 * moviéndose en Stripe. Los mismos que FAMILY_COLLECTION_OPEN_STATUSES
 * (family-collection-schema.ts), copiados aquí para que esta política siga
 * siendo pura.
 */
export const AUTOMATIC_COLLECTION_IN_PROGRESS_STATUSES: readonly string[] = ["claimed", "created", "processing"];

/** ¿El último intento de la factura está en marcha (`claimed`, `created` o `processing`)? */
export function isAutomaticCollectionInProgress(status: string | null | undefined): boolean {
  return typeof status === "string" && AUTOMATIC_COLLECTION_IN_PROGRESS_STATUSES.includes(status);
}

/**
 * ¿Espera la cuota a su cobro automático (sin recordatorios)?
 *
 * Primero, siempre (con la bandera encendida o apagada, los cerrojos abiertos
 * o cerrados y sea cual sea el modo de la cuota): si el último intento de su
 * factura está en curso (`claimed`, `created`, `processing`), espera. El
 * dinero puede estar moviéndose y el proceso diario lo sigue releyendo aunque
 * la bandera esté apagada; un recordatorio llevaría a la familia a pagar por
 * fuera y se cobraría dos veces. Es la misma regla que bloquea el pago manual
 * (guardManualAllocation en ledger-service.ts). Si se atasca, la academia
 * tiene un aviso.
 *
 * El resto, solo si la cuota es `automatic` y el cobro automático está
 * abierto (bandera, cerrojos y tablas). Con la bandera apagada, las cuotas
 * automáticas sin cobro en curso se tratan como manuales: tampoco las retiene
 * un reintento pendiente, porque con la bandera apagada no saldrá; si se
 * envía un recordatorio y la bandera se vuelve a encender, la puerta del cobro
 * cierra ese reintento con `reminder_sent` y nunca cobra. Según el último
 * intento de su factura:
 * - ninguno: espera hasta AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS días
 *   después de la fecha de cobro prevista (`collectionDateLocal`);
 * - fallido con reintento: espera hasta esos días después de la fecha del
 *   reintento; fallo final: vuelve a los recordatorios;
 * - cancelado (puerta, academia, pago manual o revisión): vuelve;
 * - cobrado (`succeeded`) y la cuota aún debe algo (reparto en revisión,
 *   devolución): espera esos días desde el cobro y después vuelve.
 *
 * `paymentMethodCollectable` (por defecto, sí): el método activo del pagador
 * se puede cobrar solo. Es `false` cuando paga por domiciliación y
 * ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED está apagada: la puerta
 * nunca crearía ese cobro (`sepa_not_enabled`), así que ni la espera sin
 * intento ni un reintento pendiente retienen; la cuota recibe recordatorios
 * desde el principio. Un cobro en marcha (p. ej. una domiciliación que ya
 * está en el banco) y uno cobrado con saldo pendiente siguen reteniendo: su
 * dinero ya se movió o se está moviendo.
 */
export function automaticCollectionHolds(input: {
  collectionMode: "manual" | "automatic";
  automaticCollectionOpen: boolean;
  lastAttempt: AutomaticCollectionLastAttempt | null;
  collectionDateLocal: string;
  todayLocal: string;
  paymentMethodCollectable?: boolean;
}): boolean {
  if (isAutomaticCollectionInProgress(input.lastAttempt?.status)) return true;
  if (input.collectionMode !== "automatic" || !input.automaticCollectionOpen) return false;
  const collectable = input.paymentMethodCollectable !== false;
  const last = input.lastAttempt;
  if (last === null) return collectable && withinGrace(input.collectionDateLocal, input.todayLocal);
  switch (last.status) {
    case "canceled":
      return false;
    case "failed":
      return collectable && last.retryDateLocal !== null && withinGrace(last.retryDateLocal, input.todayLocal);
    case "succeeded":
      return last.completedDateLocal === null || withinGrace(last.completedDateLocal, input.todayLocal);
    default:
      return true;
  }
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
