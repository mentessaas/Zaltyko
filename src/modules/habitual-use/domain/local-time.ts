/**
 * Horas locales de la sede para los avisos de uso habitual.
 *
 * Todo se calcula con `Intl.DateTimeFormat` y la zona IANA de la sede, sin
 * depender de la zona del servidor. Las funciones son puras: reciben el
 * instante y devuelven datos, para poder probarlas sin reloj ni base de datos.
 */

const DEFAULT_TIMEZONE = "Europe/Madrid";
const MS_PER_DAY = 86_400_000;

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 1 = lunes … 7 = domingo (ISO 8601). */
  isoWeekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Devuelve una zona IANA válida; una zona desconocida cae a Europe/Madrid. */
export function safeTimezone(timezone: string | null | undefined): string {
  const candidate = (timezone ?? "").trim();
  if (!candidate) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(instant: Date, timezone: string | null | undefined): LocalParts {
  const zone = safeTimezone(timezone);
  const values: Record<string, string> = {};
  for (const part of formatterFor(zone).formatToParts(instant)) values[part.type] = part.value;
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    isoWeekday: WEEKDAYS[values.weekday ?? ""] ?? 1,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Fecha local «AAAA-MM-DD». */
export function localDate(instant: Date, timezone: string | null | undefined): string {
  const parts = localParts(instant, timezone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Hora local «HH:MM», la que ve quien entrena en la sede. */
export function localTimeLabel(instant: Date, timezone: string | null | undefined): string {
  const parts = localParts(instant, timezone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  const moved = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** Lunes (fecha local) de la semana ISO a la que pertenece el instante. */
export function localWeekStart(instant: Date, timezone: string | null | undefined): string {
  const parts = localParts(instant, timezone);
  return addDays(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}`, -(parts.isoWeekday - 1));
}

/** Clave de semana ISO «AAAA-Www» según la fecha local de la sede. */
export function isoWeekKey(instant: Date, timezone: string | null | undefined): string {
  const monday = localWeekStart(instant, timezone);
  // El jueves de la semana decide el año ISO.
  const thursday = addDays(monday, 3);
  const [year] = thursday.split("-").map(Number) as [number];
  const firstThursday = (() => {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const offset = (jan4.getUTCDay() + 6) % 7; // lunes = 0
    return new Date(jan4.getTime() - offset * MS_PER_DAY + 3 * MS_PER_DAY);
  })();
  const [ty, tm, td] = thursday.split("-").map(Number) as [number, number, number];
  const thursdayMs = Date.UTC(ty, tm - 1, td);
  const week = 1 + Math.round((thursdayMs - firstThursday.getTime()) / (7 * MS_PER_DAY));
  return `${year}-W${pad(week)}`;
}

/**
 * Ventana del resumen semanal: la mañana del lunes en la sede. Se envía en el
 * primer disparo del cron que cae entre las 08:00 y las 11:59 locales; si el
 * disparo se retrasa unas horas, el resumen sigue saliendo ese mismo lunes.
 */
export const OWNER_DIGEST_FIRST_HOUR = 8;
export const OWNER_DIGEST_LAST_HOUR = 11;

export function isOwnerDigestWindow(instant: Date, timezone: string | null | undefined): boolean {
  const parts = localParts(instant, timezone);
  return (
    parts.isoWeekday === 1 && parts.hour >= OWNER_DIGEST_FIRST_HOUR && parts.hour <= OWNER_DIGEST_LAST_HOUR
  );
}

export interface DigestWeeks {
  /** Semana que acaba de terminar: [from, to) en fechas locales. */
  current: { from: string; to: string };
  /** La semana anterior a esa. */
  previous: { from: string; to: string };
}

/** Semana lunes-domingo ya terminada y la anterior, en fechas locales de la sede. */
export function digestWeeks(instant: Date, timezone: string | null | undefined): DigestWeeks {
  const thisMonday = localWeekStart(instant, timezone);
  const lastMonday = addDays(thisMonday, -7);
  const beforeMonday = addDays(thisMonday, -14);
  return {
    current: { from: lastMonday, to: thisMonday },
    previous: { from: beforeMonday, to: lastMonday },
  };
}

/**
 * Zona del resumen de una persona: si todas sus sedes comparten zona, esa; si no,
 * la zona por defecto de la academia.
 */
export function resolveDigestTimezone(
  organizationTimezone: string | null | undefined,
  locationTimezones: ReadonlyArray<string | null | undefined>
): string {
  const zones = new Set(locationTimezones.map((zone) => safeTimezone(zone)));
  if (zones.size === 1) return [...zones][0] as string;
  return safeTimezone(organizationTimezone);
}

/** Horas de silencio de la sede: no se manda un recordatorio de lista de madrugada. */
export const QUIET_HOURS_START = 22;
export const QUIET_HOURS_END = 7;

export function isQuietHour(instant: Date, timezone: string | null | undefined): boolean {
  const { hour } = localParts(instant, timezone);
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}
