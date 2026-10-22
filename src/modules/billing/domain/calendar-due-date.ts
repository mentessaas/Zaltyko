export function calendarDueDateToUtc(
  dueDate: string,
  timezone: string
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new RangeError("La fecha debe tener formato YYYY-MM-DD.");
  }
  const [year, month, day] = dueDate.split("-").map(Number);
  const validDate = new Date(Date.UTC(year, month - 1, day));
  if (
    validDate.getUTCFullYear() !== year ||
    validDate.getUTCMonth() !== month - 1 ||
    validDate.getUTCDate() !== day
  ) {
    throw new RangeError("La fecha no existe en el calendario.");
  }

  const wallClock = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
  });
  let candidate = wallClock;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .map((part) => [part.type, part.value])
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
      Number(parts.fractionalSecond)
    );
    const next = wallClock - (represented - candidate);
    if (next === candidate) break;
    candidate = next;
  }
  return new Date(candidate).toISOString();
}
