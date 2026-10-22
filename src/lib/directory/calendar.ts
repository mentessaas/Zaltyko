import type { DirectoryEntry } from "./contracts";
import { DirectoryError } from "./service";
export function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/[,;]/g, (m) => `\\${m}`);
}
function nextDay(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}
function fold(line: string) {
  let result = "",
    chunk = "";
  for (const c of line) {
    if (Buffer.byteLength(chunk + c) > 73) {
      result += chunk + "\r\n ";
      chunk = "";
    }
    chunk += c;
  }
  return result + chunk;
}
export function calendarFile(entry: DirectoryEntry) {
  const d = entry.data;
  if (entry.kind !== "event" || d.eventStatus !== "confirmed" || !d.startDate)
    throw new DirectoryError(
      "NOT_CONFIRMED",
      "Solo se exportan eventos confirmados",
      409
    );
  // Date-only exports preserve an all-day interval; do not invent midnight or a missing end time.
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zaltyko//Directorio ES//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${entry.id}@zaltyko.com`,
    `DTSTAMP:${new Date(entry.updatedAt)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "")}`,
    ...(d.startTime && d.timezone
      ? [
          `DTSTART;TZID=${d.timezone}:${d.startDate.replaceAll("-", "")}T${d.startTime.replace(":", "")}00`,
        ]
      : [
          `DTSTART;VALUE=DATE:${d.startDate.replaceAll("-", "")}`,
          `DTEND;VALUE=DATE:${nextDay(d.endDate ?? d.startDate)}`,
        ]),
    `SUMMARY:${escapeIcs(d.name)}`,
    `DESCRIPTION:${escapeIcs([d.description, d.startTime ? `Hora publicada: ${d.startTime} (${d.timezone})` : "Hora sin confirmar", `Organiza: ${d.organizerName}`, d.sourceUrl].filter(Boolean).join("\n"))}`,
    `LOCATION:${escapeIcs([d.venue, d.address, d.city, d.countryCode].filter(Boolean).join(", "))}`,
    `URL:${escapeIcs(d.registrationUrl ?? d.sourceUrl)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
