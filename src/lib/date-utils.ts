/**
 * Utilidades para manejo de fechas y zonas horarias según el país de la academia
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import { es, enUS } from "date-fns/locale";
import { startOfWeek, endOfWeek, startOfDay, endOfDay, addDays, startOfMonth, endOfMonth, isToday, getDay } from "date-fns";
import type { Locale } from "date-fns";
import { logger } from "@/lib/logger";

/**
 * Mapeo de países a zonas horarias IANA
 */
const COUNTRY_TIMEZONES: Record<string, string> = {
  ES: "Europe/Madrid", // España
  MX: "America/Mexico_City", // México
  AR: "America/Argentina/Buenos_Aires", // Argentina
  CO: "America/Bogota", // Colombia
  CL: "America/Santiago", // Chile
  PE: "America/Lima", // Perú
  VE: "America/Caracas", // Venezuela
  EC: "America/Guayaquil", // Ecuador
  GT: "America/Guatemala", // Guatemala
  CU: "America/Havana", // Cuba
  BO: "America/La_Paz", // Bolivia
  DO: "America/Santo_Domingo", // República Dominicana
  HN: "America/Tegucigalpa", // Honduras
  PY: "America/Asuncion", // Paraguay
  SV: "America/El_Salvador", // El Salvador
  NI: "America/Managua", // Nicaragua
  CR: "America/Costa_Rica", // Costa Rica
  PA: "America/Panama", // Panamá
  UY: "America/Montevideo", // Uruguay
  US: "America/New_York", // Estados Unidos (por defecto Eastern)
  // Valores legacy: el onboarding persiste el nombre visible del país en
  // `academies.country`, no siempre su código ISO.
  ESPANA: "Europe/Madrid",
  SPAIN: "Europe/Madrid",
  MEXICO: "America/Mexico_City",
  ARGENTINA: "America/Argentina/Buenos_Aires",
  COLOMBIA: "America/Bogota",
  CHILE: "America/Santiago",
  PERU: "America/Lima",
  VENEZUELA: "America/Caracas",
  ECUADOR: "America/Guayaquil",
  GUATEMALA: "America/Guatemala",
  CUBA: "America/Havana",
  BOLIVIA: "America/La_Paz",
  "REPUBLICA DOMINICANA": "America/Santo_Domingo",
  HONDURAS: "America/Tegucigalpa",
  PARAGUAY: "America/Asuncion",
  "EL SALVADOR": "America/El_Salvador",
  NICARAGUA: "America/Managua",
  "COSTA RICA": "America/Costa_Rica",
  PANAMA: "America/Panama",
  URUGUAY: "America/Montevideo",
  "PUERTO RICO": "America/Puerto_Rico",
  "ESTADOS UNIDOS": "America/New_York",
  USA: "America/New_York",
};

/**
 * Mapeo de países a locales de date-fns
 */
const COUNTRY_LOCALES: Record<string, Locale> = {
  ES: es,
  MX: es,
  AR: es,
  CO: es,
  CL: es,
  PE: es,
  VE: es,
  EC: es,
  GT: es,
  CU: es,
  BO: es,
  DO: es,
  HN: es,
  PY: es,
  SV: es,
  NI: es,
  CR: es,
  PA: es,
  UY: es,
  US: enUS,
  ESPANA: es,
  SPAIN: enUS,
  MEXICO: es,
  ARGENTINA: es,
  COLOMBIA: es,
  CHILE: es,
  PERU: es,
  VENEZUELA: es,
  ECUADOR: es,
  GUATEMALA: es,
  CUBA: es,
  BOLIVIA: es,
  "REPUBLICA DOMINICANA": es,
  HONDURAS: es,
  PARAGUAY: es,
  "EL SALVADOR": es,
  NICARAGUA: es,
  "COSTA RICA": es,
  PANAMA: es,
  URUGUAY: es,
  "PUERTO RICO": es,
  "ESTADOS UNIDOS": enUS,
  USA: enUS,
};

function normalizeCountryKey(country: string): string {
  return country
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function isCalendarDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Obtiene la zona horaria IANA para un país dado
 */
export function getTimezoneForCountry(country: string | null | undefined): string {
  if (!country) {
    return "Europe/Madrid"; // Default
  }
  return COUNTRY_TIMEZONES[normalizeCountryKey(country)] || "Europe/Madrid";
}

/**
 * Obtiene el locale de date-fns para un país dado
 */
export function getLocaleForCountry(country: string | null | undefined): Locale {
  if (!country) {
    return es; // Default español
  }
  return COUNTRY_LOCALES[normalizeCountryKey(country)] || es;
}

/**
 * Obtiene la fecha actual en la zona horaria del país
 */
export function getNowInCountryTimezone(country: string | null | undefined): Date {
  const timezone = getTimezoneForCountry(country);
  const now = new Date();
  return toZonedTime(now, timezone);
}

/**
 * Convierte una fecha a la zona horaria del país
 */
export function convertToCountryTimezone(
  date: Date | string,
  country: string | null | undefined
): Date {
  const timezone = getTimezoneForCountry(country);
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return toZonedTime(dateObj, timezone);
}

/**
 * Obtiene el inicio del día en la zona horaria del país
 */
export function getStartOfDayInTimezone(
  date: Date | string,
  country: string | null | undefined
): Date {
  const timezone = getTimezoneForCountry(country);
  if (typeof date === "string" && isCalendarDateString(date)) {
    // La cadena representa medianoche en la academia, no medianoche UTC.
    return fromZonedTime(new Date(`${date}T00:00:00`), timezone);
  }
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(dateObj, timezone);
  zonedDate.setHours(0, 0, 0, 0);
  return fromZonedTime(zonedDate, timezone);
}

/**
 * Compara si dos fechas son el mismo día en la zona horaria del país
 */
export function isSameDayInTimezone(
  date1: Date | string,
  date2: Date | string,
  country: string | null | undefined
): boolean {
  const timezone = getTimezoneForCountry(country);
  const d1Key = typeof date1 === "string" && isCalendarDateString(date1)
    ? date1
    : formatDateForCountry(date1, country, "yyyy-MM-dd");
  const d2Key = typeof date2 === "string" && isCalendarDateString(date2)
    ? date2
    : formatDateForCountry(date2, country, "yyyy-MM-dd");

  if (d1Key !== "—" && d2Key !== "—") return d1Key === d2Key;

  const d1 = typeof date1 === "string" ? new Date(date1) : date1;
  const d2 = typeof date2 === "string" ? new Date(date2) : date2;
  
  const zoned1 = toZonedTime(d1, timezone);
  const zoned2 = toZonedTime(d2, timezone);
  
  return (
    zoned1.getFullYear() === zoned2.getFullYear() &&
    zoned1.getMonth() === zoned2.getMonth() &&
    zoned1.getDate() === zoned2.getDate()
  );
}

/**
 * Formatea una fecha según el país y formato especificado
 */
export function formatDateForCountry(
  date: Date | string | null | undefined,
  country: string | null | undefined,
  formatStr: string = "PPP"
): string {
  if (!date) return "—";
  
  const timezone = getTimezoneForCountry(country);
  const locale = getLocaleForCountry(country);
  
  // Las fechas YYYY-MM-DD son fechas de calendario, no instantes UTC. Se
  // formatean en UTC para conservar exactamente el día guardado.
  const calendarDate = typeof date === "string" && isCalendarDateString(date)
    ? parseCalendarDate(date)
    : null;
  if (typeof date === "string" && isCalendarDateString(date) && !calendarDate) {
    return "—";
  }

  let dateObj: Date;
  if (calendarDate) {
    dateObj = calendarDate;
  } else if (typeof date === "string") {
    dateObj = new Date(date);
  } else {
    dateObj = date;
  }
  
  // Validar que la fecha sea válida
  if (!dateObj || isNaN(dateObj.getTime())) {
    logger.warn("Fecha inválida recibida en formatDateForCountry", { date, dateType: typeof date, country, formatStr });
    return "—";
  }
  
  try {
    return formatInTimeZone(
      dateObj,
      calendarDate ? "UTC" : timezone,
      formatStr,
      { locale }
    );
  } catch (error) {
    logger.error("Error al formatear fecha", error as Error, { date, country, formatStr, dateObj: dateObj.toISOString() });
    return "—";
  }
}

/**
 * Formatea una fecha corta (día/mes/año) según el país
 */
export function formatShortDateForCountry(
  date: Date | string | null | undefined,
  country: string | null | undefined
): string {
  return formatDateForCountry(date, country, "d MMM yyyy");
}

/**
 * Formatea una fecha larga según el país
 */
export function formatLongDateForCountry(
  date: Date | string | null | undefined,
  country: string | null | undefined
): string {
  return formatDateForCountry(date, country, "PPP");
}

/**
 * Formatea fecha y hora según el país
 */
export function formatDateTimeForCountry(
  date: Date | string | null | undefined,
  country: string | null | undefined
): string {
  return formatDateForCountry(date, country, "PPP 'a las' p");
}

/**
 * Formatea solo la hora según el país
 */
export function formatTimeForCountry(
  date: Date | string | null | undefined,
  country: string | null | undefined
): string {
  if (!date) return "—";
  
  const timezone = getTimezoneForCountry(country);
  const locale = getLocaleForCountry(country);
  const dateObj = typeof date === "string" ? new Date(date) : date;
  
  return formatInTimeZone(dateObj, timezone, "HH:mm", { locale });
}

/**
 * Convierte una fecha ISO string a Date en la zona horaria del país
 */
export function parseDateInTimezone(
  dateString: string,
  country: string | null | undefined
): Date {
  const timezone = getTimezoneForCountry(country);
  const date = new Date(dateString);
  return toZonedTime(date, timezone);
}

/**
 * Obtiene la fecha de hoy en la zona horaria del país
 */
export function getTodayInCountryTimezone(country: string | null | undefined): Date {
  const timezone = getTimezoneForCountry(country);
  const now = new Date();
  const zonedNow = toZonedTime(now, timezone);
  zonedNow.setHours(0, 0, 0, 0);
  return fromZonedTime(zonedNow, timezone);
}

/**
 * Compara si una fecha es hoy en la zona horaria del país
 */
export function isTodayInCountryTimezone(
  date: Date | string,
  country: string | null | undefined
): boolean {
  if (typeof date === "string" && isCalendarDateString(date)) {
    return date === formatDateToISOString(new Date(), country);
  }
  const timezone = getTimezoneForCountry(country);
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(dateObj, timezone);
  const todayZoned = getTodayInCountryTimezone(country);
  return isSameDayInTimezone(zonedDate, todayZoned, country);
}

/**
 * Formatea un rango de fechas según el país
 */
export function formatDateRangeForCountry(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  country: string | null | undefined
): string {
  if (!startDate || !endDate) return "—";
  
  const timezone = getTimezoneForCountry(country);
  const locale = getLocaleForCountry(country);
  
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;
  
  const startTimezone = typeof startDate === "string" && isCalendarDateString(startDate) ? "UTC" : timezone;
  const endTimezone = typeof endDate === "string" && isCalendarDateString(endDate) ? "UTC" : timezone;
  const formattedStart = formatInTimeZone(start, startTimezone, "d MMM", { locale });
  const formattedEnd = formatInTimeZone(end, endTimezone, "d MMM yyyy", { locale });
  
  return `${formattedStart} - ${formattedEnd}`;
}

/**
 * Convierte una fecha a formato ISO string (YYYY-MM-DD) usando la zona horaria del país.
 * Esto evita problemas cuando se usa toISOString() que siempre devuelve UTC.
 * IMPORTANTE: Esta función preserva el día de la fecha tal como se muestra en la zona horaria del país.
 * @param date Fecha a convertir.
 * @param countryCode Código del país.
 * @returns Cadena de fecha en formato 'YYYY-MM-DD' según la zona horaria del país.
 */
export function formatDateToISOString(
  date: Date,
  countryCode: string | null | undefined
): string {
  if (!countryCode) {
    // Si no hay país, usar formato local simple
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  
  const timezone = getTimezoneForCountry(countryCode);
  // Usar formatInTimeZone que maneja correctamente la conversión de zona horaria
  // sin cambiar el día cuando la fecha ya está en el formato correcto
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

/**
 * Interpreta una fecha de calendario (YYYY-MM-DD) sin convertirla desde/hacia
 * la zona horaria del navegador o del servidor. Las fechas de sesiones son
 * fechas locales de la academia, no instantes UTC.
 */
export function parseCalendarDate(dateKey: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/** Devuelve la fecha de calendario en formato YYYY-MM-DD. */
export function formatCalendarDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** Suma días de calendario sin depender de la zona horaria del proceso. */
export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Suma días a una clave de fecha YYYY-MM-DD. */
export function addDaysToCalendarDate(dateKey: string, days: number): string | null {
  const date = parseCalendarDate(dateKey);
  return date ? formatCalendarDate(addCalendarDays(date, days)) : null;
}

/**
 * Devuelve las claves de calendario del lunes y domingo de la semana de una
 * fecha, calculadas en una zona IANA concreta. Las claves se mantienen como
 * fechas de calendario para que una academia en América no dependa de la zona
 * horaria del proceso que ejecuta el servidor.
 */
export function getWeekCalendarDateKeys(
  date: Date | string,
  timezone: string,
): { start: string; end: string } {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const todayKey = formatInTimeZone(dateObj, timezone, "yyyy-MM-dd");
  const parsed = parseCalendarDate(todayKey);

  if (!parsed) {
    throw new Error("INVALID_WEEK_REFERENCE_DATE");
  }

  const daysSinceMonday = (parsed.getUTCDay() + 6) % 7;
  const start = addDaysToCalendarDate(todayKey, -daysSinceMonday);
  const end = addDaysToCalendarDate(todayKey, 6 - daysSinceMonday);

  if (!start || !end) {
    throw new Error("INVALID_WEEK_BOUNDARIES");
  }

  return { start, end };
}

/**
 * Obtiene los límites de la semana (lunes a domingo) en la zona horaria de un país.
 * @param date Fecha de referencia.
 * @param countryCode Código del país.
 * @returns Objeto con `start` y `end` de la semana.
 */
export function getWeekBoundariesInCountryTimezone(
  date: Date | string,
  countryCode: string | null | undefined
): { start: Date; end: Date } {
  const timezone = getTimezoneForCountry(countryCode);
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(dateObj, timezone);
  
  const start = startOfWeek(zonedDate, { weekStartsOn: 1 }); // Lunes como inicio de semana
  const end = endOfWeek(zonedDate, { weekStartsOn: 1 });
  
  // Convertir de vuelta a UTC para mantener consistencia
  return {
    start: fromZonedTime(startOfDay(start), timezone),
    end: fromZonedTime(endOfDay(end), timezone),
  };
}

/**
 * Obtiene los límites del mes en la zona horaria de un país.
 * @param date Fecha de referencia.
 * @param countryCode Código del país.
 * @returns Objeto con `start` y `end` del mes.
 */
export function getMonthBoundariesInCountryTimezone(
  date: Date | string,
  countryCode: string | null | undefined
): { start: Date; end: Date } {
  const timezone = getTimezoneForCountry(countryCode);
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(dateObj, timezone);
  
  const start = startOfMonth(zonedDate);
  const end = endOfMonth(zonedDate);
  
  return {
    start: fromZonedTime(startOfDay(start), timezone),
    end: fromZonedTime(endOfDay(end), timezone),
  };
}

/**
 * Obtiene la primera fecha para un día de la semana específico en la zona horaria del país.
 * @param start Fecha de inicio del rango.
 * @param weekday Día de la semana (0=Domingo, 1=Lunes, ..., 6=Sábado).
 * @param countryCode Código del país.
 * @returns Fecha del primer día de la semana especificado.
 */
/**
 * Obtiene la primera fecha para un día de la semana específico en la zona horaria del país.
 * @param start Fecha de inicio del rango.
 * @param weekday Día de la semana (0=Domingo, 1=Lunes, ..., 6=Sábado).
 * @param countryCode Código del país.
 * @returns Fecha del primer día de la semana especificado.
 */
export function getFirstDateForWeekdayInTimezone(
  start: Date,
  weekday: number,
  countryCode: string | null | undefined
): Date {
  const timezone = getTimezoneForCountry(countryCode);
  const zonedStart = toZonedTime(start, timezone);
  
  // Normalizar a medianoche en la zona horaria del país
  zonedStart.setHours(0, 0, 0, 0);
  
  // Usar getDay de date-fns que funciona correctamente con objetos Date
  const startWeekday = getDay(zonedStart); // date-fns: 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  
  // Convertir 0 (Domingo) a 7 para facilitar el cálculo
  const targetDay = weekday === 0 ? 7 : weekday;
  const currentDay = startWeekday === 0 ? 7 : startWeekday;
  
  let daysToAdd = (targetDay - currentDay + 7) % 7;
  
  if (daysToAdd === 0 && startWeekday !== weekday) {
    daysToAdd = 7;
  }
  
  const result = addDays(zonedStart, daysToAdd);
  
  // Si la fecha resultante es anterior al inicio del rango, avanzar una semana
  if (result < zonedStart) {
    return fromZonedTime(addDays(result, 7), timezone);
  }
  
  return fromZonedTime(result, timezone);
}

/**
 * Formatea una fecha de forma relativa (Hoy, Mañana, Ayer, o fecha)
 * @param dateStr Fecha en formato string
 * @param countryCode Código del país para determinar la zona horaria
 * @returns String formateado de forma relativa
 */
export function formatRelativeDate(
  dateStr: string | null | undefined,
  countryCode: string | null | undefined = null
): string {
  if (!dateStr) return "";

  if (isCalendarDateString(dateStr) && countryCode) {
    const todayKey = formatDateToISOString(new Date(), countryCode);
    const target = parseCalendarDate(dateStr);
    const today = parseCalendarDate(todayKey);
    if (!target || !today) return "";

    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Hoy";
    if (diffDays === 1) return "Mañana";
    if (diffDays === -1) return "Ayer";
    if (diffDays > 1 && diffDays <= 7) return `En ${diffDays} días`;
    if (diffDays >= -7 && diffDays < -1) return `Hace ${Math.abs(diffDays)} días`;
    return formatShortDateForCountry(dateStr, countryCode);
  }

  const date = new Date(dateStr);
  const today = getTodayInCountryTimezone(countryCode);
  const targetDate = countryCode
    ? convertToCountryTimezone(date, countryCode)
    : date;

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Mañana";
  if (diffDays === -1) return "Ayer";
  if (diffDays > 1 && diffDays <= 7) return `En ${diffDays} días`;
  if (diffDays >= -7 && diffDays < -1) return `Hace ${Math.abs(diffDays)} días`;

  // Si no es cercano, return fecha formateada
  return formatShortDateForCountry(dateStr, countryCode);
}

/**
 * Calcula la edad exacta a partir de una fecha de nacimiento.
 * Versión unificada - usar esta función en lugar de implementaciones duplicadas.
 *
 * @param dob - Fecha de nacimiento (puede ser Date, string ISO, o null)
 * @returns Edad en años (entero), o 0 si dob es null/inválida
 */
export function calculateAge(dob: Date | string | null | undefined): number {
  if (!dob) return 0;

  const birthDate = typeof dob === "string" ? new Date(dob) : dob;

  // Validar que la fecha sea válida
  if (isNaN(birthDate.getTime())) {
    logger.warn("Fecha de nacimiento inválida en calculateAge", { dob });
    return 0;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  // Restar un año si aún no ha pasado el cumpleaños este año
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  // Asegurar que la edad no sea negativa
  return Math.max(0, age);
}

/**
 * Calcula la edad para un atleta dado su fecha de nacimiento y país de la academia.
 * Versión específica para atletas con soporte de zona horaria.
 *
 * @param dob - Fecha de nacimiento del atleta
 * @param countryCode - Código del país de la academia (para zona horaria)
 * @returns Edad en años
 */
export function calculateAthleteAge(
  dob: Date | string | null | undefined,
  countryCode?: string | null
): number {
  if (!dob) return 0;

  // Si hay país, usar la zona horaria para cálculos precisos
  if (countryCode) {
    const timezone = getTimezoneForCountry(countryCode);
    const birthDate = typeof dob === "string"
      ? toZonedTime(new Date(dob), timezone)
      : toZonedTime(dob, timezone);
    const today = new Date();
    const todayZoned = toZonedTime(today, timezone);

    let age = todayZoned.getFullYear() - birthDate.getFullYear();
    const monthDiff = todayZoned.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && todayZoned.getDate() < birthDate.getDate())) {
      age -= 1;
    }

    return Math.max(0, age);
  }

  // Sin país, usar cálculo simple
  return calculateAge(dob);
}
