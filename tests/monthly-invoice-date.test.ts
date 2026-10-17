import { describe, expect, it } from "vitest";

import { calendarDueDateToUtc } from "@/modules/billing/domain/calendar-due-date";

describe("calendarDueDateToUtc", () => {
  it("convierte el final del día de Madrid respetando el horario de verano", () => {
    expect(calendarDueDateToUtc("2026-03-29", "Europe/Madrid")).toBe(
      "2026-03-29T21:59:59.999Z"
    );
    expect(calendarDueDateToUtc("2026-10-25", "Europe/Madrid")).toBe(
      "2026-10-25T22:59:59.999Z"
    );
  });

  it("usa el final del día UTC para sedes UTC", () => {
    expect(calendarDueDateToUtc("2026-10-31", "UTC")).toBe(
      "2026-10-31T23:59:59.999Z"
    );
  });

  it("rechaza fechas que no existen", () => {
    expect(() => calendarDueDateToUtc("2026-02-30", "Europe/Madrid")).toThrow();
  });
});
