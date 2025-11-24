/**
 * Utilidades para manejo de fechas y zonas horarias según el país de la academia
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import { es, enUS } from "date-fns/locale";
import { startOfWeek, endOfWeek, startOfDay, endOfDay, addDays, startOfMonth, endOfMonth, isToday, getDay } from "date-fns";
import type { Locale } from "date-fns";

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
};

/**
 * Obtiene la zona horaria IANA para un país dado
 */
export function getTimezoneForCountry(country: string | null | undefined): string {
  if (!country) {
    return "Europe/Madrid"; // Default
  }
  return COUNTRY_TIMEZONES[country.toUpperCase()] || "Europe/Madrid";
}

/**
 * Obtiene el locale de date-fns para un país dado
 */
export function getLocaleForCountry(country: string | null | undefined): Locale {
  if (!country) {
    return es; // Default español
  }
  return COUNTRY_LOCALES[country.toUpperCase()] || es;
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
  const dateObj = typeof date === "string" ? new Date(date) : date;
  
  return formatInTimeZone(dateObj, timezone, formatStr, { locale });
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
  
  const formattedStart = formatInTimeZone(start, timezone, "d MMM", { locale });
  const formattedEnd = formatInTimeZone(end, timezone, "d MMM yyyy", { locale });
  
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


