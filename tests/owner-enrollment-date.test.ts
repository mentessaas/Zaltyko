import { describe, expect, it } from "vitest";
import {
  constrainEnrollmentStartDate,
  isEnrollmentStartDateAllowed,
} from "@/components/owner-dashboard/owner-enrollment-date";

describe("fecha de inicio de una inscripción", () => {
  const futureWindow = {
    effectiveFrom: "2026-11-01",
    effectiveTo: "2027-06-30",
  };

  it("desplaza hoy al inicio futuro de la clase seleccionada", () => {
    expect(constrainEnrollmentStartDate("2026-10-23", futureWindow)).toBe(
      "2026-11-01"
    );
  });

  it("conserva una fecha elegida dentro del periodo", () => {
    expect(constrainEnrollmentStartDate("2026-12-15", futureWindow)).toBe(
      "2026-12-15"
    );
  });

  it("recorta una fecha posterior al cierre del periodo", () => {
    expect(constrainEnrollmentStartDate("2027-07-01", futureWindow)).toBe(
      "2027-06-30"
    );
  });

  it("rechaza fechas vacías o fuera de los límites", () => {
    expect(isEnrollmentStartDateAllowed("", futureWindow)).toBe(false);
    expect(isEnrollmentStartDateAllowed("2026-10-31", futureWindow)).toBe(false);
    expect(isEnrollmentStartDateAllowed("2027-07-01", futureWindow)).toBe(false);
    expect(isEnrollmentStartDateAllowed("2026-11-01", futureWindow)).toBe(true);
  });

  it("admite una clase sin fecha final", () => {
    expect(
      isEnrollmentStartDateAllowed("2027-07-01", {
        effectiveFrom: "2026-11-01",
        effectiveTo: null,
      })
    ).toBe(true);
  });
});
