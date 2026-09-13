type TicketDateOptions = {
  withTime?: boolean;
  timeZone?: string;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter({ withTime = false, timeZone }: TicketDateOptions) {
  const cacheKey = `${timeZone ?? "local"}:${withTime ? "time" : "date"}`;
  const cached = formatterCache.get(cacheKey);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : {}),
    ...(timeZone ? { timeZone } : {}),
  });
  formatterCache.set(cacheKey, formatter);
  return formatter;
}

export function formatTicketDate(value: string | Date, options: TicketDateOptions = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  try {
    const formatted = getFormatter(options).format(date);
    return options.withTime
      ? formatted.replace(", ", " a las ")
      : formatted;
  } catch {
    return "Fecha no disponible";
  }
}
