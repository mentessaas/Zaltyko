// Resuelve la próxima clase concreta (fecha+hora) a partir del schedule
// recurrente semanal devuelto por /api/me/schedule.
//
// La API entrega clases recurrentes (día de la semana + hora) sin una
// fecha específica, pero el home del atleta necesita mostrar "Tu próxima
// clase" con día y hora concretos. Esta utilidad expande cada item a sus
// próximas ocurrencias dentro de una ventana, las filtra y devuelve la
// más cercana en el futuro (≥ ahora, ≤ ventana).

import type { ScheduleItem } from '@/lib/api/endpoints';

// Mapeo de nombre de día en español (tal cual lo devuelve el backend en
// /api/me/schedule/route.ts:60) → day-of-week de Date (0=Domingo..6=Sábado).
const DAY_NAME_TO_INDEX: Record<string, number> = {
  Domingo: 0,
  Lunes: 1,
  Martes: 2,
  Miércoles: 3,
  Jueves: 4,
  Viernes: 5,
  Sábado: 6,
};

const DAY_INDEX_TO_NAME = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export interface NextClassOccurrence {
  item: ScheduleItem;
  start: Date;
  end: Date;
}

// Parsea "HH:MM" del inicio/fin del rango "10:00 - 11:00". Si el formato
// es inesperado, devuelve null y el caller decide qué hacer.
function parseStartEnd(timeRange: string): { hours: number; minutes: number } | null {
  const start = timeRange.split('-')[0]?.trim();
  if (!start) return null;
  const [h, m] = start.split(':');
  if (!h || !m) return null;
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { hours, minutes };
}

function parseEnd(timeRange: string): { hours: number; minutes: number } | null {
  const end = timeRange.split('-')[1]?.trim();
  if (!end) return null;
  const [h, m] = end.split(':');
  if (!h || !m) return null;
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { hours, minutes };
}

/**
 * Devuelve la próxima clase (≥ ahora, ≤ ahora + windowDays) o null si el
 * atleta no tiene clases programadas dentro de la ventana.
 *
 * `now` es inyectable para que los tests sean deterministas; en producción
 * se omite y se usa `new Date()`.
 */
export function nextClassFromSchedule(
  items: ScheduleItem[] | undefined,
  options: { now?: Date; windowDays?: number } = {}
): NextClassOccurrence | null {
  if (!items || items.length === 0) return null;
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? 7;
  const horizon = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const candidates: NextClassOccurrence[] = [];

  for (const item of items) {
    const targetDow = DAY_NAME_TO_INDEX[item.day];
    if (targetDow === undefined) continue;
    const startParts = parseStartEnd(item.time);
    const endParts = parseEnd(item.time);
    if (!startParts || !endParts) continue;

    // Construye la ocurrencia de esta semana: el próximo día de la semana
    // targetDow que sea >= hoy. Si item.day coincide con hoy pero la hora
    // ya pasó, se desplaza a la semana siguiente (mismo día, +7d).
    const todayDow = now.getDay();
    let deltaDays = (targetDow - todayDow + 7) % 7;
    let start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + deltaDays,
      startParts.hours,
      startParts.minutes,
      0,
      0,
    );
    const end = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      endParts.hours,
      endParts.minutes,
      0,
      0,
    );
    if (start.getTime() < now.getTime()) {
      start = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    if (start.getTime() < now.getTime()) continue;
    if (start.getTime() > horizon.getTime()) continue;

    candidates.push({ item, start, end });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.start.getTime() - b.start.getTime());
  return candidates[0] ?? null;
}

/** Formatea día+hora en es-ES para mostrar al atleta. Ej: "miércoles 13 ago · 18:30". */
export function formatNextClassWhen(
  occurrence: NextClassOccurrence,
  locale: string = 'es-ES'
): string {
  const dayLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(occurrence.start);
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(occurrence.start);
  return `${dayLabel} · ${timeLabel}`;
}

/** Re-exporta el array de días para tests o etiquetas que lo necesiten. */
export const SCHEDULE_DAY_NAMES = DAY_INDEX_TO_NAME;
