/**
 * Modelos de las gráficas del Resumen, Asistencia y Cobros de `/owner`.
 *
 * Funciones puras: reciben las filas agregadas que devuelve PostgreSQL y las
 * convierten en series completas (semanas y meses sin hueco), cuotas y estados
 * vacíos. No inventan datos: una semana sin lista pasada se marca como «sin
 * lista», no como cero (The No Fake Zero Rule de DESIGN.md), y una serie sin
 * ningún registro produce un estado vacío que explica cómo llenarla.
 */

export const ATTENDANCE_WEEKS = 8;
export const SIGNUP_MONTHS = 6;
export const OCCUPANCY_VISIBLE_CLASSES = 8;

const DAY_MS = 86_400_000;

// ─── Fechas (cadenas ISO «YYYY-MM-DD», aritmética en UTC) ────────────────────

function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`Fecha ISO inválida: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`Fecha ISO inválida: ${value}`);
  }
  return parsed;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(date).getTime() + days * DAY_MS));
}

/** Lunes de la semana ISO que contiene la fecha. */
export function isoWeekStart(date: string): string {
  const parsed = parseIsoDate(date);
  const weekday = (parsed.getUTCDay() + 6) % 7; // lunes = 0
  return addDays(date, -weekday);
}

export function monthStart(date: string): string {
  parseIsoDate(date);
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(firstOfMonth: string, months: number): string {
  const parsed = parseIsoDate(monthStart(firstOfMonth));
  return toIsoDate(
    new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + months, 1))
  );
}

/** Fecha local («YYYY-MM-DD») de un instante en una zona horaria IANA. */
export function localIsoDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) throw new RangeError(`Zona horaria inválida: ${timeZone}`);
  return `${year}-${month}-${day}`;
}

const shortDay = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const shortMonth = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" });
const longMonth = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthName = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" });

function cleanLabel(value: string): string {
  return value.replace(/\./g, "").trim();
}

/** «3 nov» */
export function formatShortDay(date: string): string {
  return cleanLabel(shortDay.format(parseIsoDate(date)));
}

/** «nov» */
export function formatShortMonth(firstOfMonth: string): string {
  return cleanLabel(shortMonth.format(parseIsoDate(firstOfMonth)));
}

/** «noviembre de 2026» */
export function formatLongMonth(firstOfMonth: string): string {
  return longMonth.format(parseIsoDate(firstOfMonth));
}

/** «noviembre» */
export function formatMonthName(firstOfMonth: string): string {
  return monthName.format(parseIsoDate(firstOfMonth));
}

function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

// ─── Asistencia por semana ───────────────────────────────────────────────────

export interface AttendanceWeekRow {
  /** Lunes de la semana en la zona horaria de la sede. */
  weekStart: string;
  present: number;
  late: number;
  excused: number;
  absent: number;
  /** Sesiones con al menos una marca en esa semana. */
  sessions: number;
}

export interface AttendanceWeek {
  weekStart: string;
  /** «3 nov», lunes de la semana. */
  label: string;
  /** Presentes y llegadas tarde. */
  attended: number;
  /** Ausencias y faltas justificadas. */
  missed: number;
  present: number;
  late: number;
  excused: number;
  absent: number;
  records: number;
  sessions: number;
  /** Presencias / marcas, de 0 a 1; null si esa semana no se pasó lista. */
  rate: number | null;
  current: boolean;
}

export interface AttendanceWeeksChart {
  state: "empty" | "ready";
  weeks: AttendanceWeek[];
  totals: { attended: number; missed: number; records: number; sessions: number };
  /** Asistencia de toda la ventana (0 a 1); null sin marcas. */
  rate: number | null;
  /**
   * Diferencia en puntos entre las 4 últimas semanas y las 4 anteriores.
   * Null si alguna de las dos mitades no tiene marcas.
   */
  rateDeltaPoints: number | null;
  /** Mayor número de marcas en una semana: escala del eje. */
  peak: number;
}

export function attendanceWeekStarts(today: string, weeks = ATTENDANCE_WEEKS): string[] {
  const current = isoWeekStart(today);
  return Array.from({ length: weeks }, (_, index) => addDays(current, (index - weeks + 1) * 7));
}

function rateOf(attended: number, records: number): number | null {
  return records > 0 ? attended / records : null;
}

export function buildAttendanceWeeks(
  rows: AttendanceWeekRow[],
  today: string,
  weeks = ATTENDANCE_WEEKS
): AttendanceWeeksChart {
  const starts = attendanceWeekStarts(today, weeks);
  const byWeek = new Map<string, AttendanceWeekRow>();
  for (const row of rows) {
    const key = isoWeekStart(row.weekStart);
    const previous = byWeek.get(key);
    byWeek.set(key, {
      weekStart: key,
      present: safeCount(row.present) + (previous?.present ?? 0),
      late: safeCount(row.late) + (previous?.late ?? 0),
      excused: safeCount(row.excused) + (previous?.excused ?? 0),
      absent: safeCount(row.absent) + (previous?.absent ?? 0),
      sessions: safeCount(row.sessions) + (previous?.sessions ?? 0),
    });
  }
  const currentWeek = starts.at(-1);
  const series: AttendanceWeek[] = starts.map((weekStart) => {
    const row = byWeek.get(weekStart);
    const present = row?.present ?? 0;
    const late = row?.late ?? 0;
    const excused = row?.excused ?? 0;
    const absent = row?.absent ?? 0;
    const attended = present + late;
    const missed = excused + absent;
    const records = attended + missed;
    return {
      weekStart,
      label: formatShortDay(weekStart),
      attended,
      missed,
      present,
      late,
      excused,
      absent,
      records,
      sessions: row?.sessions ?? 0,
      rate: rateOf(attended, records),
      current: weekStart === currentWeek,
    };
  });
  const totals = series.reduce(
    (sum, week) => ({
      attended: sum.attended + week.attended,
      missed: sum.missed + week.missed,
      records: sum.records + week.records,
      sessions: sum.sessions + week.sessions,
    }),
    { attended: 0, missed: 0, records: 0, sessions: 0 }
  );
  const half = Math.floor(series.length / 2);
  const halfRate = (part: AttendanceWeek[]) => {
    const records = part.reduce((sum, week) => sum + week.records, 0);
    return rateOf(part.reduce((sum, week) => sum + week.attended, 0), records);
  };
  const earlier = halfRate(series.slice(0, half));
  const recent = halfRate(series.slice(half));
  return {
    state: totals.records > 0 ? "ready" : "empty",
    weeks: series,
    totals,
    rate: rateOf(totals.attended, totals.records),
    rateDeltaPoints:
      earlier === null || recent === null ? null : Math.round((recent - earlier) * 100),
    peak: Math.max(0, ...series.map((week) => week.records)),
  };
}

// ─── Ocupación por clase ─────────────────────────────────────────────────────

export interface ClassOccupancyRow {
  classTemplateId: string;
  className: string;
  locationName: string;
  capacity: number;
  /** Gimnastas activas con inscripción activa o de prueba vigente hoy. */
  enrolled: number;
}

export interface ClassOccupancyItem extends ClassOccupancyRow {
  /** Plazas ocupadas / plazas (puede superar 1 si hay más inscritas que plazas). */
  fillRate: number;
  openSeats: number;
  status: "open" | "full" | "over";
}

export interface ClassOccupancyChart {
  state: "no_classes" | "no_enrollments" | "ready";
  items: ClassOccupancyItem[];
  /** Clases activas que no caben en la lista visible. */
  hiddenCount: number;
  totals: { classes: number; capacity: number; enrolled: number; full: number };
  /** Ocupación global (0 a 1); null sin plazas. */
  fillRate: number | null;
  showLocation: boolean;
}

export function buildClassOccupancy(
  rows: ClassOccupancyRow[],
  visible = OCCUPANCY_VISIBLE_CLASSES
): ClassOccupancyChart {
  const items: ClassOccupancyItem[] = rows.map((row) => {
    const capacity = safeCount(row.capacity);
    const enrolled = safeCount(row.enrolled);
    const fillRate = capacity > 0 ? enrolled / capacity : enrolled > 0 ? 1 : 0;
    return {
      ...row,
      capacity,
      enrolled,
      fillRate,
      openSeats: Math.max(capacity - enrolled, 0),
      status: enrolled > capacity ? "over" : enrolled === capacity && capacity > 0 ? "full" : "open",
    };
  });
  items.sort(
    (left, right) =>
      right.fillRate - left.fillRate ||
      right.enrolled - left.enrolled ||
      left.className.localeCompare(right.className, "es")
  );
  const totals = items.reduce(
    (sum, item) => ({
      classes: sum.classes + 1,
      capacity: sum.capacity + item.capacity,
      enrolled: sum.enrolled + item.enrolled,
      full: sum.full + (item.status === "open" ? 0 : 1),
    }),
    { classes: 0, capacity: 0, enrolled: 0, full: 0 }
  );
  const state =
    totals.classes === 0 ? "no_classes" : totals.enrolled === 0 ? "no_enrollments" : "ready";
  return {
    state,
    items: state === "ready" ? items.slice(0, visible) : [],
    hiddenCount: state === "ready" ? Math.max(items.length - visible, 0) : 0,
    totals,
    fillRate: totals.capacity > 0 ? totals.enrolled / totals.capacity : null,
    showLocation: new Set(items.map((item) => item.locationName)).size > 1,
  };
}

// ─── Cuotas del mes ──────────────────────────────────────────────────────────

export interface MonthlyFeesRow {
  currency: string;
  charges: number;
  billedCents: number;
  collectedCents: number;
  /** Pendiente aún no vencido. */
  pendingCents: number;
  /** Pendiente con el vencimiento ya pasado. */
  overdueCents: number;
}

export interface MonthlyFeesCurrency extends MonthlyFeesRow {
  /** Porcentaje cobrado redondeado (0–100). */
  collectedPercent: number;
  /** Fracciones de la barra (suman 1 cuando hay importe). */
  shares: { collected: number; pending: number; overdue: number };
}

export interface MonthlyFeesChart {
  state: "unavailable" | "empty" | "ready";
  monthStart: string;
  /** «noviembre» */
  monthName: string;
  /** «noviembre de 2026» */
  monthLabel: string;
  currencies: MonthlyFeesCurrency[];
}

export function buildMonthlyFees(
  rows: MonthlyFeesRow[] | null,
  today: string
): MonthlyFeesChart {
  const first = monthStart(today);
  const base = {
    monthStart: first,
    monthName: formatMonthName(first),
    monthLabel: formatLongMonth(first),
  };
  if (rows === null) return { ...base, state: "unavailable", currencies: [] };
  const currencies: MonthlyFeesCurrency[] = rows
    .map((row) => {
      const collected = safeCount(row.collectedCents);
      const pending = safeCount(row.pendingCents);
      const overdue = safeCount(row.overdueCents);
      const total = collected + pending + overdue;
      const billed = Math.max(safeCount(row.billedCents), total);
      return {
        currency: row.currency,
        charges: safeCount(row.charges),
        billedCents: billed,
        collectedCents: collected,
        pendingCents: pending,
        overdueCents: overdue,
        collectedPercent: total > 0 ? Math.round((collected / total) * 100) : 0,
        shares:
          total > 0
            ? { collected: collected / total, pending: pending / total, overdue: overdue / total }
            : { collected: 0, pending: 0, overdue: 0 },
      };
    })
    .filter((row) => row.charges > 0 && row.billedCents > 0)
    .sort((left, right) => right.billedCents - left.billedCents || left.currency.localeCompare(right.currency));
  return { ...base, state: currencies.length > 0 ? "ready" : "empty", currencies };
}

// ─── Altas de gimnastas por mes ──────────────────────────────────────────────

export interface AthleteSignupRow {
  /** Primer día del mes local («YYYY-MM-01»). */
  month: string;
  created: number;
}

export interface AthleteSignupMonth {
  month: string;
  /** «nov» */
  label: string;
  /** «noviembre de 2026» */
  longLabel: string;
  created: number;
  current: boolean;
}

export interface AthleteSignupsChart {
  state: "empty" | "ready";
  months: AthleteSignupMonth[];
  total: number;
  currentMonth: number;
  peak: number;
}

export function athleteSignupMonthStarts(today: string, months = SIGNUP_MONTHS): string[] {
  const current = monthStart(today);
  return Array.from({ length: months }, (_, index) => addMonths(current, index - months + 1));
}

export function buildAthleteSignups(
  rows: AthleteSignupRow[],
  today: string,
  months = SIGNUP_MONTHS
): AthleteSignupsChart {
  const starts = athleteSignupMonthStarts(today, months);
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const key = monthStart(row.month);
    byMonth.set(key, (byMonth.get(key) ?? 0) + safeCount(row.created));
  }
  const current = starts.at(-1);
  const series = starts.map((month) => ({
    month,
    label: formatShortMonth(month),
    longLabel: formatLongMonth(month),
    created: byMonth.get(month) ?? 0,
    current: month === current,
  }));
  const total = series.reduce((sum, month) => sum + month.created, 0);
  return {
    state: total > 0 ? "ready" : "empty",
    months: series,
    total,
    currentMonth: series.at(-1)?.created ?? 0,
    peak: Math.max(0, ...series.map((month) => month.created)),
  };
}

// ─── Estados vacíos didácticos ───────────────────────────────────────────────

export type SummaryChartActionTarget =
  | "attendance"
  | "classes"
  | "enrollments"
  | "monthly-invoices"
  | "athletes";

export interface SummaryChartEmptyCopy {
  title: string;
  /** Qué aparecerá aquí. */
  body: string;
  /** Qué hace falta para que aparezca. */
  how: string;
  action: { label: string; target: SummaryChartActionTarget } | null;
}

export function attendanceEmptyCopy(): SummaryChartEmptyCopy {
  return {
    title: "Aún no hay listas pasadas",
    body: "Aquí verás cuántas gimnastas vinieron cada semana y qué parte de las marcas fueron presencias.",
    how: "La gráfica empieza a dibujarse en cuanto pases lista en una sesión.",
    action: { label: "Pasar lista", target: "attendance" },
  };
}

export function occupancyEmptyCopy(chart: ClassOccupancyChart): SummaryChartEmptyCopy {
  if (chart.state === "no_enrollments") {
    return {
      title: "Tus clases aún no tienen inscritas",
      body: `Aquí verás cuántas plazas ocupa cada una de tus ${chart.totals.classes} ${chart.totals.classes === 1 ? "clase" : "clases"} y cuáles están completas.`,
      how: "Inscribe gimnastas en una clase y la ocupación aparece al momento.",
      action: { label: "Inscribir gimnastas", target: "enrollments" },
    };
  }
  return {
    title: "Aún no hay clases activas",
    body: "Aquí verás cuántas plazas ocupa cada clase y cuáles están completas.",
    how: "Crea una clase con sus plazas y luego inscribe gimnastas en ella.",
    action: { label: "Crear una clase", target: "classes" },
  };
}

export function monthlyFeesEmptyCopy(chart: MonthlyFeesChart): SummaryChartEmptyCopy {
  return {
    title: `Sin cuotas de ${chart.monthName}`,
    body: `Aquí verás lo cobrado, lo pendiente y lo vencido de las cuotas de ${chart.monthName}.`,
    how: "Aparece en cuanto emitas las cuotas del mes. Los pagos que registres la irán llenando.",
    action: { label: "Emitir cuotas del mes", target: "monthly-invoices" },
  };
}

export function athleteSignupsEmptyCopy(canManageAthletes: boolean): SummaryChartEmptyCopy {
  return {
    title: "Aún no hay fichas en estos meses",
    body: "Aquí verás cuántas gimnastas das de alta cada mes.",
    how: "Cada ficha nueva suma una marca en el mes en que la creas.",
    action: canManageAthletes ? { label: "Añadir gimnasta", target: "athletes" } : null,
  };
}

/** Porcentaje legible: «82 %». */
export function formatPercent(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)} %`;
}
