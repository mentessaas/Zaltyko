export function getLocalCalendarDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Keeps today's date from becoming a future timestamp when it is still morning. */
export function localDateToReceivedAt(
  selectedDate: string,
  now = new Date()
): string {
  if (selectedDate === getLocalCalendarDate(now)) return now.toISOString();

  const noon = new Date(`${selectedDate}T12:00:00`);
  if (Number.isNaN(noon.getTime())) {
    throw new RangeError("La fecha de recepción no es válida");
  }
  return noon.toISOString();
}
