/**
 * Cobro automático de cuotas (Fase 3): qué se cobra de una factura mensual y
 * cuándo. Funciones puras: quien llama les pasa la factura y sus cuotas ya
 * cargadas, con el saldo de cada una.
 *
 * - P1 (Elvis, 16-11-2026): un cobro por familia, sede y mes, es decir, por
 *   factura mensual. El importe es la suma de los saldos de sus cuotas
 *   automáticas abiertas que ya tocan cobrar.
 * - P2: la academia elige el día de cobro: el día de vencimiento de la cuota
 *   (por defecto) o un día fijo del mes (1–31). En los meses sin ese día, el
 *   último día del mes. Nunca antes del vencimiento. Fechas en la hora local
 *   de la sede.
 */

export type CollectionPlanInvoiceStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "void";

export type CollectionPlanChargeStatus = "due" | "partially_paid" | "paid" | "void";

export interface CollectionPlanInvoice {
  id: string;
  /** Emitida por la cuota mensual (`monthly-invoice/issue.ts`). Las manuales nunca se cobran solas. */
  isMonthly: boolean;
  status: CollectionPlanInvoiceStatus;
  currency: string;
}

export interface CollectionPlanCharge {
  id: string;
  collectionMode: "manual" | "automatic";
  status: CollectionPlanChargeStatus;
  currency: string;
  /** Importe menos lo ya repartido a la cuota, en céntimos. */
  outstandingCents: number;
  /** `due_at`: las 23:59:59.999 locales del día de vencimiento (calendar-due-date.ts). */
  dueAt: Date | string;
}

export type CollectionPlanSkipReason =
  | "not_monthly"
  | "invoice_closed"
  | "nothing_due"
  | "not_due_yet"
  | "mixed_currency";

export interface CollectionAllocation {
  chargeId: string;
  amountCents: number;
}

export type CollectionPlan =
  | { collect: true; amountCents: number; allocations: CollectionAllocation[] }
  | { collect: false; reason: CollectionPlanSkipReason };

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseLocalDate(value: string): { year: number; month: number; day: number } {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError("La fecha debe tener formato YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError("La fecha no existe en el calendario.");
  }
  return { year, month, day };
}

function formatLocalDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  // Día 0 del mes siguiente = último día de este mes.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Fecha (YYYY-MM-DD) de un instante en la zona horaria de la sede. */
export function localCalendarDate(instant: Date | string, timezone: string): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("El instante no es una fecha válida.");
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Día de cobro local (P2). Sin día fijo, el día de vencimiento. Con día fijo
 * `D`, el día `min(D, último día del mes)` del mes del vencimiento; si cae
 * antes del vencimiento, el día de vencimiento.
 */
export function collectionDate(input: {
  dueDateLocal: string;
  collectionDayOfMonth: number | null;
}): string {
  const due = parseLocalDate(input.dueDateLocal);
  const fixedDay = input.collectionDayOfMonth;
  if (fixedDay === null) return input.dueDateLocal;
  if (!Number.isInteger(fixedDay) || fixedDay < 1 || fixedDay > 31) {
    throw new RangeError("El día de cobro debe ser un entero del 1 al 31.");
  }
  const day = Math.min(fixedDay, daysInMonth(due.year, due.month));
  const candidate = formatLocalDate(due.year, due.month, day);
  // Las fechas YYYY-MM-DD se ordenan igual como texto.
  const dueDate = formatLocalDate(due.year, due.month, due.day);
  return candidate < dueDate ? dueDate : candidate;
}

const COLLECTIBLE_INVOICE_STATUSES: ReadonlySet<CollectionPlanInvoiceStatus> = new Set([
  "issued",
  "partially_paid",
]);

const OPEN_CHARGE_STATUSES: ReadonlySet<CollectionPlanChargeStatus> = new Set([
  "due",
  "partially_paid",
]);

function dueInstant(value: Date | string): number {
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  if (!Number.isFinite(time)) throw new RangeError("El vencimiento no es una fecha válida.");
  return time;
}

/**
 * ¿Se cobra hoy esta factura y cuánto? Solo factura mensual emitida o pagada
 * en parte; solo sus cuotas automáticas abiertas con saldo cuya fecha de cobro
 * local ya llegó. Las cuotas manuales de la misma factura no se tocan.
 *
 * `todayLocal` es la fecha de hoy en la zona de la sede (`localCalendarDate`)
 * y `timezone` esa misma zona, con la que se lee el día de vencimiento de cada
 * `due_at`.
 */
export function planInvoiceCollection(input: {
  invoice: CollectionPlanInvoice;
  charges: readonly CollectionPlanCharge[];
  todayLocal: string;
  collectionDayOfMonth: number | null;
  timezone: string;
}): CollectionPlan {
  parseLocalDate(input.todayLocal);
  if (!input.invoice.isMonthly) return { collect: false, reason: "not_monthly" };
  if (!COLLECTIBLE_INVOICE_STATUSES.has(input.invoice.status)) {
    return { collect: false, reason: "invoice_closed" };
  }

  const open = input.charges.filter(
    (charge) =>
      charge.collectionMode === "automatic" &&
      OPEN_CHARGE_STATUSES.has(charge.status) &&
      Number.isSafeInteger(charge.outstandingCents) &&
      charge.outstandingCents > 0
  );
  if (open.length === 0) return { collect: false, reason: "nothing_due" };
  if (open.some((charge) => charge.currency !== input.invoice.currency)) {
    return { collect: false, reason: "mixed_currency" };
  }

  const due = open
    .filter(
      (charge) =>
        collectionDate({
          dueDateLocal: localCalendarDate(charge.dueAt, input.timezone),
          collectionDayOfMonth: input.collectionDayOfMonth,
        }) <= input.todayLocal
    )
    .sort(
      (left, right) =>
        dueInstant(left.dueAt) - dueInstant(right.dueAt) ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    );
  if (due.length === 0) return { collect: false, reason: "not_due_yet" };

  const amountCents = due.reduce((sum, charge) => sum + charge.outstandingCents, 0);
  if (!Number.isSafeInteger(amountCents)) {
    throw new RangeError("El importe del cobro no es un número de céntimos válido.");
  }
  return {
    collect: true,
    amountCents,
    allocations: due.map((charge) => ({
      chargeId: charge.id,
      amountCents: charge.outstandingCents,
    })),
  };
}
