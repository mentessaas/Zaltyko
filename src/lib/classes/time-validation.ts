/**
 * Reglas de horario compartidas por API y superficies operativas.
 * Las clases de una misma jornada no pueden terminar antes de empezar.
 * Los campos vacíos siguen siendo válidos porque el horario puede definirse
 * más adelante.
 */
export function isValidClassTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined
): boolean {
  if (!startTime || !endTime) return true;

  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return false;

  return end > start;
}

export function formatClassTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined
): string {
  if (!startTime && !endTime) return "Horario flexible";
  if (startTime && !endTime) return `Desde ${startTime}`;
  if (!isValidClassTimeRange(startTime, endTime)) return "Horario por revisar";
  return `${startTime} – ${endTime}`;
}

function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
