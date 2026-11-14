import { describe, expect, it } from "vitest";

import {
  addMonths,
  athleteSignupsEmptyCopy,
  attendanceEmptyCopy,
  attendanceWeekStarts,
  buildAthleteSignups,
  buildAttendanceWeeks,
  buildClassOccupancy,
  buildMonthlyFees,
  formatPercent,
  isoWeekStart,
  localIsoDate,
  monthlyFeesEmptyCopy,
  occupancyEmptyCopy,
  type AttendanceWeekRow,
  type ClassOccupancyRow,
} from "@/modules/owner-dashboard/domain/summary-charts-model";

// Sábado 14 de noviembre de 2026: la semana en curso empieza el lunes 9.
const TODAY = "2026-11-14";

function week(weekStart: string, values: Partial<AttendanceWeekRow> = {}): AttendanceWeekRow {
  return { weekStart, present: 0, late: 0, excused: 0, absent: 0, sessions: 0, ...values };
}

function klass(name: string, capacity: number, enrolled: number, locationName = "Centro"): ClassOccupancyRow {
  return { classTemplateId: `id-${name}`, className: name, locationName, capacity, enrolled };
}

describe("fechas de las series", () => {
  it("lleva cualquier día al lunes de su semana ISO", () => {
    expect(isoWeekStart("2026-11-14")).toBe("2026-11-09");
    expect(isoWeekStart("2026-11-09")).toBe("2026-11-09");
    expect(isoWeekStart("2026-11-15")).toBe("2026-11-09");
    expect(isoWeekStart("2027-01-01")).toBe("2026-12-28");
  });

  it("devuelve las 8 semanas terminando en la actual, de la más antigua a la más reciente", () => {
    const starts = attendanceWeekStarts(TODAY);
    expect(starts).toHaveLength(8);
    expect(starts[0]).toBe("2026-09-21");
    expect(starts.at(-1)).toBe("2026-11-09");
  });

  it("suma meses cruzando el año", () => {
    expect(addMonths("2026-11-01", 2)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("calcula la fecha local en la zona de la sede", () => {
    const lateNightUtc = new Date("2026-11-14T23:30:00Z");
    expect(localIsoDate(lateNightUtc, "Europe/Madrid")).toBe("2026-11-15");
    expect(localIsoDate(lateNightUtc, "America/Mexico_City")).toBe("2026-11-14");
  });

  it("rechaza fechas imposibles en lugar de inventar una", () => {
    expect(() => isoWeekStart("2026-02-30")).toThrow(RangeError);
  });
});

describe("asistencia por semana", () => {
  it("rellena las semanas sin lista sin pintarlas como cero (No Fake Zero)", () => {
    const chart = buildAttendanceWeeks(
      [week("2026-11-02", { present: 8, late: 1, excused: 1, absent: 2, sessions: 3 })],
      TODAY
    );
    expect(chart.state).toBe("ready");
    expect(chart.weeks).toHaveLength(8);
    const withList = chart.weeks.find((item) => item.weekStart === "2026-11-02");
    expect(withList).toMatchObject({ attended: 9, missed: 3, records: 12, sessions: 3, current: false });
    expect(withList?.rate).toBeCloseTo(0.75);
    const withoutList = chart.weeks.filter((item) => item.weekStart !== "2026-11-02");
    expect(withoutList.every((item) => item.records === 0 && item.rate === null)).toBe(true);
    expect(chart.weeks.at(-1)?.current).toBe(true);
    expect(chart.peak).toBe(12);
  });

  it("agrupa en la semana correcta aunque la fila llegue con un día que no es lunes", () => {
    const chart = buildAttendanceWeeks(
      [
        week("2026-11-10", { present: 2, sessions: 1 }),
        week("2026-11-12", { absent: 1, sessions: 1 }),
      ],
      TODAY
    );
    expect(chart.weeks.at(-1)).toMatchObject({ weekStart: "2026-11-09", present: 2, absent: 1, sessions: 2 });
  });

  it("descarta las semanas fuera de la ventana", () => {
    const chart = buildAttendanceWeeks([week("2026-08-03", { present: 5, sessions: 1 })], TODAY);
    expect(chart.state).toBe("empty");
    expect(chart.totals.records).toBe(0);
    expect(chart.rate).toBeNull();
  });

  it("compara las 4 últimas semanas con las 4 anteriores en puntos", () => {
    const chart = buildAttendanceWeeks(
      [
        week("2026-09-28", { present: 6, absent: 4, sessions: 2 }), // 60 %
        week("2026-11-02", { present: 8, absent: 2, sessions: 2 }), // 80 %
      ],
      TODAY
    );
    expect(chart.rateDeltaPoints).toBe(20);
    expect(chart.rate).toBeCloseTo(0.7);
    expect(formatPercent(chart.rate)).toBe("70 %");
  });

  it("no compara si una de las dos mitades no tiene lista", () => {
    const chart = buildAttendanceWeeks([week("2026-11-02", { present: 3, sessions: 1 })], TODAY);
    expect(chart.rateDeltaPoints).toBeNull();
  });

  it("sin ninguna marca es un estado vacío que explica cómo empezar", () => {
    const chart = buildAttendanceWeeks([], TODAY);
    expect(chart.state).toBe("empty");
    expect(chart.weeks).toHaveLength(8);
    const copy = attendanceEmptyCopy();
    expect(copy.action).toEqual({ label: "Pasar lista", target: "attendance" });
    expect(copy.how).toMatch(/pases lista/);
  });

  it("ignora cuentas negativas o no numéricas", () => {
    const chart = buildAttendanceWeeks(
      [week("2026-11-09", { present: -3, late: Number.NaN, absent: 2, sessions: 1 })],
      TODAY
    );
    expect(chart.weeks.at(-1)).toMatchObject({ present: 0, late: 0, absent: 2, records: 2 });
  });
});

describe("ocupación por clase", () => {
  it("ordena de más a menos llena y marca completas y por encima de las plazas", () => {
    const chart = buildClassOccupancy([
      klass("Rítmica base", 10, 4),
      klass("Artística avanzada", 8, 8),
      klass("Iniciación", 6, 7),
    ]);
    expect(chart.state).toBe("ready");
    expect(chart.items.map((item) => [item.className, item.status, item.openSeats])).toEqual([
      ["Iniciación", "over", 0],
      ["Artística avanzada", "full", 0],
      ["Rítmica base", "open", 6],
    ]);
    expect(chart.totals).toEqual({ classes: 3, capacity: 24, enrolled: 19, full: 2 });
    expect(chart.fillRate).toBeCloseTo(19 / 24);
    expect(chart.showLocation).toBe(false);
  });

  it("enseña solo las primeras clases y cuenta las que quedan", () => {
    const rows = Array.from({ length: 11 }, (_, index) => klass(`Clase ${index}`, 10, index));
    const chart = buildClassOccupancy(rows);
    expect(chart.items).toHaveLength(8);
    expect(chart.hiddenCount).toBe(3);
    expect(chart.items[0].className).toBe("Clase 10");
  });

  it("muestra la sede solo cuando hay más de una", () => {
    const chart = buildClassOccupancy([klass("A", 5, 1, "Norte"), klass("B", 5, 2, "Sur")]);
    expect(chart.showLocation).toBe(true);
  });

  it("distingue «sin clases» de «clases sin inscritas» y propone el paso que falta", () => {
    const noClasses = buildClassOccupancy([]);
    expect(noClasses.state).toBe("no_classes");
    expect(noClasses.fillRate).toBeNull();
    expect(occupancyEmptyCopy(noClasses).action).toEqual({ label: "Crear una clase", target: "classes" });

    const noEnrollments = buildClassOccupancy([klass("A", 5, 0), klass("B", 5, 0)]);
    expect(noEnrollments.state).toBe("no_enrollments");
    expect(noEnrollments.items).toEqual([]);
    const copy = occupancyEmptyCopy(noEnrollments);
    expect(copy.action).toEqual({ label: "Inscribir gimnastas", target: "enrollments" });
    expect(copy.body).toContain("2 clases");
  });
});

describe("cuotas del mes", () => {
  it("reparte cobrado, por vencer y vencido y redondea el porcentaje", () => {
    const chart = buildMonthlyFees(
      [
        {
          currency: "EUR",
          charges: 3,
          billedCents: 9000,
          collectedCents: 6000,
          pendingCents: 2000,
          overdueCents: 1000,
        },
      ],
      TODAY
    );
    expect(chart.state).toBe("ready");
    expect(chart.monthStart).toBe("2026-11-01");
    expect(chart.monthName).toBe("noviembre");
    const [eur] = chart.currencies;
    expect(eur.collectedPercent).toBe(67);
    expect(eur.shares.collected + eur.shares.pending + eur.shares.overdue).toBeCloseTo(1);
    expect(eur.shares.overdue).toBeCloseTo(1 / 9);
  });

  it("separa las monedas y pone primero la de mayor importe", () => {
    const chart = buildMonthlyFees(
      [
        { currency: "EUR", charges: 1, billedCents: 3000, collectedCents: 0, pendingCents: 3000, overdueCents: 0 },
        { currency: "MXN", charges: 2, billedCents: 90000, collectedCents: 90000, pendingCents: 0, overdueCents: 0 },
      ],
      TODAY
    );
    expect(chart.currencies.map((row) => row.currency)).toEqual(["MXN", "EUR"]);
    expect(chart.currencies[0].collectedPercent).toBe(100);
  });

  it("sin cuotas emitidas es un estado vacío con la acción de emitirlas", () => {
    const chart = buildMonthlyFees([], TODAY);
    expect(chart.state).toBe("empty");
    const copy = monthlyFeesEmptyCopy(chart);
    expect(copy.title).toBe("Sin cuotas de noviembre");
    expect(copy.action).toEqual({ label: "Emitir cuotas del mes", target: "monthly-invoices" });
  });

  it("sin acceso a finanzas no hay gráfica, ni vacía", () => {
    expect(buildMonthlyFees(null, TODAY).state).toBe("unavailable");
  });
});

describe("altas de gimnastas", () => {
  it("rellena los 6 meses y marca el mes en curso", () => {
    const chart = buildAthleteSignups(
      [
        { month: "2026-07-01", created: 4 },
        { month: "2026-11-01", created: 2 },
      ],
      TODAY
    );
    expect(chart.state).toBe("ready");
    expect(chart.months.map((month) => month.month)).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
    expect(chart.months.map((month) => month.created)).toEqual([0, 4, 0, 0, 0, 2]);
    expect(chart.months.at(-1)).toMatchObject({ current: true, longLabel: "noviembre de 2026" });
    expect(chart.total).toBe(6);
    expect(chart.currentMonth).toBe(2);
    expect(chart.peak).toBe(4);
  });

  it("sin altas es un estado vacío; la acción solo aparece si puede añadir gimnastas", () => {
    const chart = buildAthleteSignups([], TODAY);
    expect(chart.state).toBe("empty");
    expect(athleteSignupsEmptyCopy(true).action).toEqual({ label: "Añadir gimnasta", target: "athletes" });
    expect(athleteSignupsEmptyCopy(false).action).toBeNull();
  });
});
