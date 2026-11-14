/**
 * Calendario de sesiones de /owner: lógica pura de rangos y agrupado por día.
 *
 * Todas las fechas son «día de calendario» `YYYY-MM-DD` sin zona. Una sesión
 * pertenece al día en que empieza en la zona horaria de SU sede, no en la del
 * navegador ni en la del servidor. La semana empieza en lunes (ISO).
 *
 * Sin dependencias de servidor: lo usan la consulta, la ruta y la pantalla.
 */

export const CALENDAR_VIEWS = ["day", "week", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** Un mes en rejilla ocupa como mucho 6 semanas. */
export const CALENDAR_MAX_RANGE_DAYS = 42;

export interface CalendarRange {
  /** Primer día visible, incluido. */
  from: string;
  /** Último día visible, incluido. */
  to: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function toUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function fromUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isCalendarView(value: unknown): value is CalendarView {
  return typeof value === "string" && (CALENDAR_VIEWS as readonly string[]).includes(value);
}

/** Verdadero solo para fechas reales (rechaza 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = toUtcDate(value);
  return Number.isFinite(parsed.getTime()) && fromUtcDate(parsed) === value;
}

export function addDays(date: string, days: number): string {
  return fromUtcDate(new Date(toUtcDate(date).getTime() + days * DAY_MS));
}

/** Días entre dos fechas (`to` - `from`), con signo. */
export function diffDays(from: string, to: string): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / DAY_MS);
}

/** 1 = lunes … 7 = domingo. */
export function isoWeekday(date: string): number {
  const day = toUtcDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function startOfWeek(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function endOfWeek(date: string): string {
  return addDays(startOfWeek(date), 6);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  const first = toUtcDate(startOfMonth(date));
  return fromUtcDate(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)));
}

/**
 * Rango visible de cada vista: el día; lunes a domingo de la semana; y, en el
 * mes, la rejilla completa (desde el lunes de la semana del día 1 hasta el
 * domingo de la semana del último día), de 28 a 42 días.
 */
export function calendarRange(view: CalendarView, anchor: string): CalendarRange {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
  return {
    from: startOfWeek(startOfMonth(anchor)),
    to: endOfWeek(endOfMonth(anchor)),
  };
}

export function calendarRangeDays(range: CalendarRange): number {
  return diffDays(range.from, range.to) + 1;
}

/** Cada día del rango, en orden. */
export function daysInRange(range: CalendarRange): string[] {
  return Array.from({ length: calendarRangeDays(range) }, (_, index) => addDays(range.from, index));
}

/** Rejilla del mes: filas de 7 días, de lunes a domingo. */
export function monthWeeks(range: CalendarRange): string[][] {
  const days = daysInRange(range);
  const weeks: string[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  return weeks;
}

function addMonths(date: string, months: number): string {
  const source = toUtcDate(date);
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(source.getUTCDate(), lastDay));
  return fromUtcDate(target);
}

/**
 * Ancla tras «anterior» (-1) o «siguiente» (1): un día, una semana o un mes.
 * En el mes se conserva el día cuando existe (31 de enero → 28 de febrero).
 */
export function shiftAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  return addMonths(anchor, direction);
}

/** Día de calendario de un instante en una zona horaria IANA. */
export function localDateOf(instant: string | Date, timeZone: string): string {
  const value = typeof instant === "string" ? new Date(instant) : instant;
  // `sv-SE` formatea como YYYY-MM-DD (mismo recurso que usa el alta de clases).
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(value);
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return localDateOf(now, timeZone);
}

/** Hora local «HH:mm» de un instante en la zona de la sede. */
export function localTimeOf(instant: string | Date, timeZone: string): string {
  const value = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(value);
}

export interface TimedSession {
  id: string;
  startsAt: string;
  timezone: string;
}

/**
 * Agrupa las sesiones por el día local de su sede, ordenadas por hora de
 * inicio y, a igualdad, por id. Los días sin sesiones no aparecen: usa
 * `daysInRange` para pintar el calendario completo.
 */
export function groupSessionsByLocalDate<T extends TimedSession>(
  sessions: readonly T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const session of sessions) {
    const date = localDateOf(session.startsAt, session.timezone);
    const bucket = groups.get(date);
    if (bucket) bucket.push(session);
    else groups.set(date, [session]);
  }
  for (const bucket of groups.values()) {
    bucket.sort(
      (left, right) =>
        Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id)
    );
  }
  return groups;
}

/** Título legible del rango: «noviembre de 2026», «9–15 nov 2026», «lunes, 9 de noviembre». */
export function formatRangeTitle(view: CalendarView, anchor: string, locale = "es-ES"): string {
  const format = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
      new Date(`${date}T12:00:00.000Z`)
    );
  if (view === "day") {
    const label = format(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
  }
  if (view === "month") {
    const label = format(anchor, { month: "long", year: "numeric" });
    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
  }
  const range = calendarRange("week", anchor);
  const sameMonth = range.from.slice(0, 7) === range.to.slice(0, 7);
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  const start = format(range.from, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  const end = format(range.to, { day: "numeric", month: "short", year: "numeric" });
  return sameYear ? `${start}–${end}` : `${format(range.from, { day: "numeric", month: "short", year: "numeric" })} – ${end}`;
}
