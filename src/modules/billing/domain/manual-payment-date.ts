export function getCalendarDateInTimezone(
  now: Date,
  timezone: string
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});

  if (!parts.year || !parts.month || !parts.day) {
    throw new RangeError("No se pudo calcular el día civil de la sede.");
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function calendarDateAtNoonToUtc(date: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RangeError("La fecha de recepción no es válida.");
  }

  const [year, month, day] = date.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new RangeError("La fecha de recepción no es válida.");
  }

  const targetWallClock = Date.UTC(year, month - 1, day, 12);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let candidate = targetWallClock;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate)).reduce<
      Record<string, string>
    >((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
    const representedWallClock = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const next = candidate + (targetWallClock - representedWallClock);
    if (next === candidate) break;
    candidate = next;
  }

  const finalParts = formatter.formatToParts(new Date(candidate)).reduce<
    Record<string, string>
  >((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  if (
    Number(finalParts.year) !== year ||
    Number(finalParts.month) !== month ||
    Number(finalParts.day) !== day ||
    Number(finalParts.hour) !== 12 ||
    Number(finalParts.minute) !== 0
  ) {
    throw new RangeError("No se pudo convertir la fecha de recepción.");
  }

  return new Date(candidate).toISOString();
}

/** A date-only ledger entry is anchored to noon at the academy location. */
export function calendarDateToReceivedAt(
  selectedDate: string,
  timezone: string,
  now = new Date()
): string {
  if (selectedDate === getCalendarDateInTimezone(now, timezone)) {
    return now.toISOString();
  }

  return calendarDateAtNoonToUtc(selectedDate, timezone);
}
