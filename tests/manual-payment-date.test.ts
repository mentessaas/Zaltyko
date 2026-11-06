import { describe, expect, it } from "vitest";
import {
  calendarDateToReceivedAt,
  getCalendarDateInTimezone,
} from "@/modules/billing/domain/manual-payment-date";

describe("fecha civil de recepción del pago", () => {
  it("calcula hoy en la zona horaria de la sede", () => {
    expect(
      getCalendarDateInTimezone(
        new Date("2026-10-21T21:59:59.000Z"),
        "Europe/Madrid"
      )
    ).toBe("2026-10-21");
    expect(
      getCalendarDateInTimezone(
        new Date("2026-10-21T10:30:00.000Z"),
        "Pacific/Kiritimati"
      )
    ).toBe("2026-10-22");
  });

  it("conserva el instante actual cuando se registra hoy", () => {
    const now = new Date("2026-10-21T21:59:59.000Z");
    expect(calendarDateToReceivedAt("2026-10-21", "Europe/Madrid", now)).toBe(
      now.toISOString()
    );
  });

  it("convierte una fecha pasada a mediodía en la zona de la sede", () => {
    expect(
      calendarDateToReceivedAt(
        "2026-10-21",
        "Europe/Madrid",
        new Date("2026-10-22T10:00:00.000Z")
      )
    ).toBe("2026-10-21T10:00:00.000Z");
  });

  it("ajusta mediodía local después del cambio de horario de verano", () => {
    expect(
      calendarDateToReceivedAt(
        "2026-03-29",
        "Europe/Madrid",
        new Date("2026-03-30T10:00:00.000Z")
      )
    ).toBe("2026-03-29T10:00:00.000Z");
  });

  it("rechaza fechas inexistentes", () => {
    expect(() =>
      calendarDateToReceivedAt(
        "2026-02-30",
        "Europe/Madrid",
        new Date("2026-10-22T10:00:00.000Z")
      )
    ).toThrow(RangeError);
  });
});
