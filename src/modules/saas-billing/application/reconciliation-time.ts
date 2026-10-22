/** Compare provider ISO timestamps and PostgreSQL timestamptz text exactly to microseconds. */
export function sameInstant(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  const leftParts = toEpochMicroseconds(left);
  const rightParts = toEpochMicroseconds(right);
  return (
    leftParts !== null &&
    rightParts !== null &&
    leftParts.epochMilliseconds === rightParts.epochMilliseconds &&
    leftParts.remainingMicroseconds === rightParts.remainingMicroseconds
  );
}

function toEpochMicroseconds(
  value: string
): { epochMilliseconds: number; remainingMicroseconds: number } | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/iu
  );
  if (!match) return null;

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fractionText = "",
    zoneText = "Z",
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    fractionText.length > 6
  ) {
    return null;
  }

  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  const wallClockMs = calendar.getTime();
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    return null;
  }

  let offsetMinutes = 0;
  if (zoneText.toUpperCase() !== "Z") {
    const offset = zoneText.match(/^([+-])(\d{2})(?::?(\d{2}))?$/u);
    if (!offset) return null;
    const offsetHours = Number(offset[2]);
    const offsetMinutePart = Number(offset[3] ?? "0");
    if (offsetHours > 15 || offsetMinutePart > 59) return null;
    const magnitude = offsetHours * 60 + offsetMinutePart;
    offsetMinutes = offset[1] === "+" ? magnitude : -magnitude;
  }

  const milliseconds = Number(fractionText.slice(0, 3).padEnd(3, "0"));
  const remainingMicroseconds = Number(fractionText.slice(3, 6).padEnd(3, "0"));
  return {
    epochMilliseconds: wallClockMs - offsetMinutes * 60_000 + milliseconds,
    remainingMicroseconds,
  };
}
