import { describe, expect, it } from "vitest";

import {
  CALENDAR_MAX_RANGE_DAYS,
  addDays,
  calendarRange,
  calendarRangeDays,
  daysInRange,
  diffDays,
  formatRangeTitle,
  groupSessionsByLocalDate,
  isCalendarView,
  isIsoDate,
  isoWeekday,
  localDateOf,
  localTimeOf,
  monthWeeks,
  shiftAnchor,
  startOfWeek,
  todayIn,
} from "@/modules/scheduling/domain/calendar";
import { ownerCalendarQuerySchema } from "@/modules/scheduling/domain/calendar-query";

const MADRID = "Europe/Madrid";
const MEXICO = "America/Mexico_City";

// 2026-11-14 es sábado; el 1 de noviembre de 2026 es domingo.
describe("fechas de calendario", () => {
  it("solo acepta fechas reales YYYY-MM-DD", () => {
    expect(isIsoDate("2026-11-14")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-1-1")).toBe(false);
    expect(isIsoDate("14/11/2026")).toBe(false);
    expect(isIsoDate(20261114)).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it("suma días cruzando mes, año y bisiesto", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-11-14", 0)).toBe("2026-11-14");
    expect(diffDays("2026-11-09", "2026-11-15")).toBe(6);
    expect(diffDays("2026-11-15", "2026-11-09")).toBe(-6);
  });

  it("numera la semana ISO de lunes (1) a domingo (7)", () => {
    expect(isoWeekday("2026-11-09")).toBe(1);
    expect(isoWeekday("2026-11-14")).toBe(6);
    expect(isoWeekday("2026-11-15")).toBe(7);
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-09")).toBe("2026-11-09");
  });

  it("reconoce las tres vistas", () => {
    for (const view of ["day", "week", "month"]) expect(isCalendarView(view)).toBe(true);
    for (const view of ["year", "", null, undefined, 3]) expect(isCalendarView(view)).toBe(false);
  });
});

describe("rango visible de cada vista", () => {
  it("día: solo ese día", () => {
    expect(calendarRange("day", "2026-11-14")).toEqual({ from: "2026-11-14", to: "2026-11-14" });
  });

  it("semana: de lunes a domingo, también si el ancla es domingo", () => {
    expect(calendarRange("week", "2026-11-14")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(calendarRange("week", "2026-11-15")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(calendarRange("week", "2026-11-09")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
  });

  it("mes: rejilla completa de lunes a domingo (6 semanas en noviembre de 2026)", () => {
    const range = calendarRange("month", "2026-11-14");
    expect(range).toEqual({ from: "2026-10-26", to: "2026-12-06" });
    expect(calendarRangeDays(range)).toBe(42);
    expect(calendarRangeDays(range)).toBeLessThanOrEqual(CALENDAR_MAX_RANGE_DAYS);
  });

  it("mes: febrero de 2027 empieza en lunes y acaba en domingo, 4 semanas exactas", () => {
    const range = calendarRange("month", "2027-02-10");
    expect(range).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(calendarRangeDays(range)).toBe(28);
  });

  it("ningún mes de varios años supera el máximo ni empieza fuera de lunes", () => {
    for (let month = 0; month < 36; month += 1) {
      const anchor = addDays("2026-01-15", month * 30);
      const range = calendarRange("month", anchor);
      expect(isoWeekday(range.from)).toBe(1);
      expect(isoWeekday(range.to)).toBe(7);
      expect(calendarRangeDays(range)).toBeLessThanOrEqual(CALENDAR_MAX_RANGE_DAYS);
      expect(calendarRangeDays(range) % 7).toBe(0);
      expect(range.from <= anchor && anchor <= range.to).toBe(true);
    }
  });

  it("lista cada día del rango y parte el mes en filas de siete", () => {
    expect(daysInRange({ from: "2026-11-09", to: "2026-11-15" })).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    const weeks = monthWeeks(calendarRange("month", "2026-11-14"));
    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0]).toBe("2026-10-26");
    expect(weeks[0][6]).toBe("2026-11-01");
    expect(weeks[5][6]).toBe("2026-12-06");
  });
});

describe("anterior y siguiente", () => {
  it("día y semana avanzan 1 y 7 días", () => {
    expect(shiftAnchor("day", "2026-11-14", 1)).toBe("2026-11-15");
    expect(shiftAnchor("day", "2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftAnchor("week", "2026-11-14", 1)).toBe("2026-11-21");
    expect(shiftAnchor("week", "2026-01-03", -1)).toBe("2025-12-27");
  });

  it("mes conserva el día o lo ajusta al último del mes destino", () => {
    expect(shiftAnchor("month", "2026-12-15", 1)).toBe("2027-01-15");
    expect(shiftAnchor("month", "2026-01-15", -1)).toBe("2025-12-15");
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftAnchor("month", "2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftAnchor("month", "2028-01-31", 1)).toBe("2028-02-29");
  });

  it("siguiente y anterior se compensan en día y semana", () => {
    for (const view of ["day", "week"] as const) {
      expect(shiftAnchor(view, shiftAnchor(view, "2026-11-14", 1), -1)).toBe("2026-11-14");
    }
  });
});

describe("día local en la zona horaria de la sede", () => {
  it("el mismo instante cae en días distintos según la sede", () => {
    const instant = "2026-11-14T23:30:00Z";
    expect(localDateOf(instant, MADRID)).toBe("2026-11-15");
    expect(localDateOf(instant, MEXICO)).toBe("2026-11-14");
    expect(localTimeOf(instant, MADRID)).toBe("00:30");
    expect(localTimeOf(instant, MEXICO)).toBe("17:30");
  });

  it("respeta el horario de verano de Madrid", () => {
    // CEST (UTC+2): 22:30Z ya es el día siguiente; 21:59Z todavía no.
    expect(localDateOf("2026-07-14T22:30:00Z", MADRID)).toBe("2026-07-15");
    expect(localDateOf("2026-07-14T21:59:00Z", MADRID)).toBe("2026-07-14");
    // CET (UTC+1) en invierno: el límite se mueve una hora.
    expect(localDateOf("2026-12-14T22:30:00Z", MADRID)).toBe("2026-12-14");
    expect(localDateOf("2026-12-14T23:00:00Z", MADRID)).toBe("2026-12-15");
  });

  it("«hoy» depende de la zona, no del servidor", () => {
    const now = new Date("2026-11-14T23:30:00Z");
    expect(todayIn(MADRID, now)).toBe("2026-11-15");
    expect(todayIn(MEXICO, now)).toBe("2026-11-14");
  });
});

describe("agrupado por día local", () => {
  const sessions = [
    { id: "a", startsAt: "2026-11-14T23:30:00Z", timezone: MADRID },
    { id: "b", startsAt: "2026-11-14T23:30:00Z", timezone: MEXICO },
    { id: "c", startsAt: "2026-11-15T08:00:00Z", timezone: MADRID },
    { id: "e", startsAt: "2026-11-15T07:00:00Z", timezone: MADRID },
    { id: "d", startsAt: "2026-11-15T07:00:00Z", timezone: MADRID },
  ];

  it("agrupa por el día de cada sede y ordena por hora y, a igualdad, por id", () => {
    const grouped = groupSessionsByLocalDate(sessions);

    expect([...grouped.keys()].sort()).toEqual(["2026-11-14", "2026-11-15"]);
    expect(grouped.get("2026-11-14")?.map((session) => session.id)).toEqual(["b"]);
    expect(grouped.get("2026-11-15")?.map((session) => session.id)).toEqual(["a", "d", "e", "c"]);
  });

  it("no altera la lista de entrada y devuelve vacío sin sesiones", () => {
    const copy = sessions.map((session) => session.id);
    groupSessionsByLocalDate(sessions);
    expect(sessions.map((session) => session.id)).toEqual(copy);
    expect(groupSessionsByLocalDate([]).size).toBe(0);
  });

  it("los días sin sesiones no aparecen: el calendario los completa con daysInRange", () => {
    const grouped = groupSessionsByLocalDate(sessions);
    const week = daysInRange(calendarRange("week", "2026-11-14"));
    expect(week.filter((day) => !grouped.has(day))).toHaveLength(5);
  });
});

describe("título del rango", () => {
  it("día y mes, con mayúscula inicial", () => {
    expect(formatRangeTitle("day", "2026-11-14")).toBe("Sábado, 14 de noviembre de 2026");
    expect(formatRangeTitle("month", "2026-11-14")).toBe("Noviembre de 2026");
  });

  it("semana: abrevia el rango dentro y a través de meses y años", () => {
    expect(formatRangeTitle("week", "2026-11-14")).toBe("9–15 nov 2026");
    expect(formatRangeTitle("week", "2026-11-30")).toBe("30 nov–6 dic 2026");
    const crossYear = formatRangeTitle("week", "2026-12-30");
    expect(crossYear).toContain("2026");
    expect(crossYear).toContain("2027");
    expect(crossYear).toContain(" – ");
  });
});

describe("consulta de la API del calendario", () => {
  const organizationId = "10000000-0000-4000-8000-000000000001";
  const locationId = "20000000-0000-4000-8000-000000000002";
  const groupId = "30000000-0000-4000-8000-000000000003";
  const base = { organizationId, from: "2026-11-09", to: "2026-11-15" };

  it("acepta academia y rango, con sede y grupo opcionales", () => {
    expect(ownerCalendarQuerySchema.safeParse(base).success).toBe(true);
    expect(ownerCalendarQuerySchema.safeParse({ ...base, locationId, groupId }).success).toBe(true);
    expect(ownerCalendarQuerySchema.safeParse({ ...base, to: base.from }).success).toBe(true);
  });

  it("rechaza ids que no son UUID, fechas imposibles y claves desconocidas", () => {
    expect(ownerCalendarQuerySchema.safeParse({ ...base, organizationId: "x" }).success).toBe(false);
    expect(ownerCalendarQuerySchema.safeParse({ ...base, locationId: "x" }).success).toBe(false);
    expect(ownerCalendarQuerySchema.safeParse({ ...base, groupId: "x" }).success).toBe(false);
    expect(ownerCalendarQuerySchema.safeParse({ ...base, from: "2026-02-30" }).success).toBe(false);
    expect(ownerCalendarQuerySchema.safeParse({ ...base, to: "mañana" }).success).toBe(false);
    expect(ownerCalendarQuerySchema.safeParse({ ...base, limit: "500" }).success).toBe(false);
    expect(ownerCalendarQuerySchema.safeParse({ from: base.from, to: base.to }).success).toBe(false);
    expect(ownerCalendarQuerySchema.safeParse({ organizationId, to: base.to }).success).toBe(false);
  });

  it("rechaza un fin anterior al inicio y rangos de más de 42 días", () => {
    expect(ownerCalendarQuerySchema.safeParse({ ...base, from: "2026-11-15", to: "2026-11-09" }).success).toBe(false);
    const limit = ownerCalendarQuerySchema.safeParse({ ...base, from: "2026-10-26", to: "2026-12-06" });
    expect(limit.success).toBe(true);
    const over = ownerCalendarQuerySchema.safeParse({ ...base, from: "2026-10-26", to: "2026-12-07" });
    expect(over.success).toBe(false);
  });
});
