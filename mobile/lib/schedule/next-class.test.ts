import { describe, it, expect } from 'vitest';

import {
  nextClassFromSchedule,
  formatNextClassWhen,
  type NextClassOccurrence,
} from './next-class';
import type { ScheduleItem } from '@/lib/api/endpoints';

function item(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 'cls-1',
    className: 'Pre-benjamín A',
    day: 'Lunes',
    time: '17:00 - 18:30',
    location: 'Pista 2',
    coach: 'Ana Ruiz',
    ...overrides,
  };
}

// Referencia fija: miércoles 2026-08-12 10:00:00 local.
const WED_10AM = new Date(2026, 7, 12, 10, 0, 0, 0);

describe('nextClassFromSchedule', () => {
  it('devuelve null si el schedule está vacío', () => {
    expect(nextClassFromSchedule([], { now: WED_10AM })).toBeNull();
    expect(nextClassFromSchedule(undefined, { now: WED_10AM })).toBeNull();
  });

  it('elige la clase más próxima cuando varias están en la misma semana', () => {
    const schedule: ScheduleItem[] = [
      item({ id: 'fri', day: 'Viernes', time: '17:00 - 18:30' }),
      item({ id: 'thu', day: 'Jueves', time: '17:00 - 18:30' }),
      item({ id: 'sat', day: 'Sábado', time: '10:00 - 11:30' }),
    ];
    const result = nextClassFromSchedule(schedule, { now: WED_10AM });
    expect(result).not.toBeNull();
    expect(result!.item.id).toBe('thu');
    // Jueves 2026-08-13 17:00.
    expect(result!.start.getFullYear()).toBe(2026);
    expect(result!.start.getMonth()).toBe(7);
    expect(result!.start.getDate()).toBe(13);
    expect(result!.start.getHours()).toBe(17);
    expect(result!.start.getMinutes()).toBe(0);
  });

  it('descarta una clase cuyo día coincide con hoy pero la hora ya pasó', () => {
    // WED_10AM es miércoles 10:00. Una clase el miércoles a las 09:00 ya pasó.
    const schedule: ScheduleItem[] = [
      item({ id: 'past', day: 'Miércoles', time: '09:00 - 10:00' }),
      item({ id: 'future', day: 'Jueves', time: '17:00 - 18:30' }),
    ];
    const result = nextClassFromSchedule(schedule, { now: WED_10AM });
    expect(result!.item.id).toBe('future');
  });

  it('mantiene la clase de hoy si su hora aún no ha pasado', () => {
    // WED_10AM: una clase a las 11:00 sigue siendo futura hoy.
    const schedule: ScheduleItem[] = [
      item({ id: 'today', day: 'Miércoles', time: '11:00 - 12:00' }),
      item({ id: 'tomorrow', day: 'Jueves', time: '17:00 - 18:30' }),
    ];
    const result = nextClassFromSchedule(schedule, { now: WED_10AM });
    expect(result!.item.id).toBe('today');
    expect(result!.start.getDate()).toBe(12); // mismo día
  });

  it('descarta ocurrencias fuera de la ventana configurada', () => {
    // Miércoles 2026-08-12 10:00. La próxima clase es el lunes (5 días).
    // Con ventana de 3 días no debe entrar.
    const schedule: ScheduleItem[] = [
      item({ id: 'next-week', day: 'Lunes', time: '09:00 - 10:00' }),
    ];
    const result = nextClassFromSchedule(schedule, {
      now: WED_10AM,
      windowDays: 3,
    });
    expect(result).toBeNull();
  });

  it('respeta una ventana personalizada de 14 días', () => {
    const schedule: ScheduleItem[] = [
      item({ id: 'next-week', day: 'Lunes', time: '09:00 - 10:00' }),
    ];
    const result = nextClassFromSchedule(schedule, {
      now: WED_10AM,
      windowDays: 14,
    });
    expect(result).not.toBeNull();
  });

  it('ignora items con día desconocido (defensivo si la API cambia)', () => {
    const schedule = [item({ id: 'bad', day: 'Funday' as unknown as string })];
    expect(nextClassFromSchedule(schedule, { now: WED_10AM })).toBeNull();
  });

  it('ignora items con time malformado', () => {
    const schedule = [item({ id: 'bad', time: 'mal' })];
    expect(nextClassFromSchedule(schedule, { now: WED_10AM })).toBeNull();
  });
});

describe('formatNextClassWhen', () => {
  it('formatea día+hora en es-ES usando la fecha de inicio', () => {
    const occ: NextClassOccurrence = {
      item: item(),
      start: new Date(2026, 7, 13, 17, 0, 0, 0), // jueves 13 ago 17:00
      end: new Date(2026, 7, 13, 18, 30, 0, 0),
    };
    const label = formatNextClassWhen(occ, 'es-ES');
    // Intl.DateTimeFormat('es-ES', weekday: 'long') → "jueves"
    expect(label).toContain('jueves');
    expect(label).toContain('17:00');
  });
});
