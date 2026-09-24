const SUPER_ADMIN_TIME_ZONE = "UTC";

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  timeZone: SUPER_ADMIN_TIME_ZONE,
});

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  timeZone: SUPER_ADMIN_TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  timeZone: SUPER_ADMIN_TIME_ZONE,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const MONTH_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  timeZone: SUPER_ADMIN_TIME_ZONE,
  month: "short",
  year: "2-digit",
});

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Los paneles Super Admin son Server Components que hidratan componentes
 * client. Todas las fechas usan UTC explícito para que Vercel y el navegador
 * produzcan exactamente el mismo texto, incluso cerca de medianoche.
 */
export function formatSuperAdminDate(value: string | Date | null | undefined): string | null {
  const date = parseDate(value);
  return date ? SHORT_DATE_FORMATTER.format(date) : null;
}

export function formatSuperAdminLongDate(value: string | Date | null | undefined): string | null {
  const date = parseDate(value);
  return date ? LONG_DATE_FORMATTER.format(date) : null;
}

export function formatSuperAdminDateTime(value: string | Date | null | undefined): string | null {
  const date = parseDate(value);
  return date ? DATE_TIME_FORMATTER.format(date) : null;
}

export function formatSuperAdminMonth(label: string): string {
  const [year, month] = label.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return label;
  return MONTH_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));
}
