/**
 * Visible strings and formatting for the family portal. Terms follow
 * docs/producto/glosario.md: familia, gimnasta, clase, sesión, sede,
 * asistencia, inscripción y cuota.
 */

export const FAMILY_PAYMENT_NOTICE =
  "El pago se gestiona directamente con tu academia. Desde aquí solo puedes consultar tus cuotas.";

/** Solo cuando la academia ofrece el pago automático a esta familia (nunca en la demo). */
export const FAMILY_AUTOMATIC_PAYMENT_NOTICE =
  "El pago se gestiona directamente con tu academia. Desde aquí puedes consultar tus cuotas y, si quieres, activar el pago automático.";

export const FAMILY_NO_ACCESS_TITLE = "Aún no hay datos que mostrar";
export const FAMILY_NO_ACCESS_BODY =
  "Tu academia todavía no ha vinculado esta cuenta a tu familia. Si crees que es un error, habla con tu academia.";

const WEEKDAYS: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

export function weekdayLabel(isoWeekday: number): string {
  return WEEKDAYS[isoWeekday] ?? "";
}

export function attendanceStatusLabel(
  status: "present" | "absent" | "excused" | "late"
): string {
  switch (status) {
    case "present":
      return "Asistió";
    case "late":
      return "Llegó tarde";
    case "excused":
      return "Falta justificada";
    case "absent":
      return "Faltó";
  }
}

export function enrollmentStatusLabel(
  status: "trial" | "active" | "paused"
): string {
  switch (status) {
    case "trial":
      return "Clase de prueba";
    case "active":
      return "Inscripción activa";
    case "paused":
      return "Inscripción en pausa";
  }
}

export function sessionStatusLabel(
  status: "scheduled" | "completed" | "cancelled"
): string {
  switch (status) {
    case "scheduled":
      return "Programada";
    case "completed":
      return "Realizada";
    case "cancelled":
      return "Cancelada";
  }
}

export function feeStatusLabel(
  status: "issued" | "partially_paid" | "paid"
): string {
  switch (status) {
    case "issued":
      return "Pendiente";
    case "partially_paid":
      return "Pagada en parte";
    case "paid":
      return "Pagada";
  }
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** "17:30:00" → "17:30". */
export function formatLocalTime(value: string): string {
  return value.slice(0, 5);
}

/** Session start in the site's own time zone, e.g. "lun, 10 nov · 17:30". */
export function formatSessionStart(isoInstant: string, timeZone: string): string {
  const date = new Date(isoInstant);
  const options = (zone: string) => ({
    day: new Intl.DateTimeFormat("es-ES", {
      timeZone: zone,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(date),
    time: new Intl.DateTimeFormat("es-ES", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  });
  let parts: { day: string; time: string };
  try {
    parts = options(timeZone);
  } catch {
    parts = options("UTC");
  }
  return `${parts.day} · ${parts.time}`;
}

/** Calendar date "2026-11-01" → "1 nov 2026", without time-zone drift. */
export function formatCalendarDate(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Due date of an instant in the academy's time zone. */
export function formatDueDate(isoInstant: string, timeZone: string): string {
  const date = new Date(isoInstant);
  const format = (zone: string) =>
    new Intl.DateTimeFormat("es-ES", {
      timeZone: zone,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}

export function formatPeriod(
  start: string | null,
  end: string | null
): string | null {
  if (!start || !end) return null;
  return start === end
    ? formatCalendarDate(start)
    : `${formatCalendarDate(start)} – ${formatCalendarDate(end)}`;
}

/**
 * Cobro automático de una cuota (Fase 3), tal como lo ve la familia. Las
 * fechas son días del calendario de la sede (YYYY-MM-DD). Nunca lleva
 * códigos del banco ni de Stripe: solo el estado.
 */
export type FamilyAutomaticFeeStatus =
  | { kind: "scheduled"; date: string }
  | { kind: "in_progress" }
  | { kind: "collected"; date: string }
  | { kind: "not_collected" };

/** Por id de factura (cuota). Solo las cuotas que se cobran solas. */
export type FamilyAutomaticFeeStatuses = Record<string, FamilyAutomaticFeeStatus>;

/**
 * Lo que la tarjeta «Pago automático» necesita saber del cobro automático
 * (Fase 3) para no prometer lo contrario de lo que pasa: si está abierto
 * (bandera, cerrojos de R11 y tablas) y, por academia, las familias cuyas
 * cuotas se cobran solas (preferencia automática vigente con plan de pago).
 */
export interface FamilyAutomaticCollectionModes {
  open: boolean;
  /** Por id de academia, los ids de familia en cobro automático. */
  automaticFamilies: Record<string, string[]>;
}

/** Cobro automático cerrado: ninguna familia se cobra sola. */
export const FAMILY_AUTOMATIC_COLLECTION_CLOSED: FamilyAutomaticCollectionModes = {
  open: false,
  automaticFamilies: {},
};

/**
 * Para una tarjeta: `closed` (no se cobra nada), `family_manual` (abierto,
 * pero las cuotas de esta familia se pagan a mano) o `automatic`.
 */
export type FamilyCardCollectionMode = "closed" | "family_manual" | "automatic";

export function familyCardCollectionMode(
  modes: FamilyAutomaticCollectionModes | undefined,
  organizationId: string,
  familyId: string
): FamilyCardCollectionMode {
  if (!modes?.open) return "closed";
  return modes.automaticFamilies[organizationId]?.includes(familyId) ? "automatic" : "family_manual";
}

export function familyAutomaticFeeText(status: FamilyAutomaticFeeStatus): string {
  switch (status.kind) {
    case "scheduled":
      return `Se cobrará automáticamente el ${formatCalendarDate(status.date)}`;
    case "in_progress":
      return "Cobro en curso";
    case "collected":
      return `Cobrada automáticamente el ${formatCalendarDate(status.date)}`;
    case "not_collected":
      return "No se pudo cobrar automáticamente; tu academia te dirá cómo pagarla";
  }
}
