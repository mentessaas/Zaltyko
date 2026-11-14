import { describe, expect, it } from "vitest";

import {
  DEMO_ORGANIZATION_ID,
  demoAttentionItems,
  demoAttendanceView,
  demoClassesBundle,
  demoFamilyAcademy,
  demoFamilyAthleteOverview,
  demoFamilyFees,
  demoOpenCharges,
  demoOperationalSummary,
  demoApiResponders,
  demoOwnerScope,
  demoTodaySessions,
  isDemoFamilyAthlete,
} from "@/modules/demo/demo-fixtures";

/** Los componentes reales validan estos formatos: la demo debe cumplirlos cualquier día. */
const COMPONENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Apellidos que son palabras de prueba: no existen como apellido de nadie. */
const FICTIONAL_SURNAMES = ["Ejemplo", "Muestra", "Prueba", "Ensayo", "Boceto", "Maqueta", "Modelo", "Esbozo", "Borrador", "Simulacro", "Ficticia", "Tanteo"];
/** Apellidos reales que una versión anterior usaba y que no deben volver. */
const REAL_SURNAMES = ["Salto", "Barra", "Viga", "Cuerda", "Aro", "Potro", "Mazas", "Tapiz", "Pelota", "Suelo"];

function daysFrom(start: string, count: number): Date[] {
  return Array.from({ length: count }, (_, index) => new Date(new Date(start).getTime() + index * 86_400_000));
}

describe("datos de la demo", () => {
  it("cada día de la semana, a cualquier hora, «Hoy» tiene sesiones válidas", () => {
    for (const hour of ["03:00", "09:30", "16:45", "21:15"]) {
      for (const now of daysFrom(`2026-11-02T${hour}:00Z`, 14)) {
        const { sessions } = demoTodaySessions(now);
        expect(sessions.length, now.toISOString()).toBeGreaterThan(0);
        expect(new Set(sessions.map((session) => session.id)).size).toBe(sessions.length);
        for (const session of sessions) {
          expect(session.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
          expect(new Date(session.endsAt).getTime()).toBeGreaterThan(new Date(session.startsAt).getTime());
          expect(session.expectedAthletes).toBeLessThanOrEqual(session.capacity);
        }
      }
    }
  });

  it("las clases cubren toda la semana y sus plazas no se superan", () => {
    const bundle = demoClassesBundle(new Date("2026-11-14T10:00:00Z"));
    const weekdays = new Set(bundle.classes.flatMap((item) => item.schedule.map((slot) => slot.isoWeekday)));
    expect([...weekdays].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const item of bundle.classes) {
      expect(item.schedule.length).toBeGreaterThan(0);
      expect(item.capacity).toBeGreaterThan(0);
      expect(bundle.locations.some((location) => location.id === item.locationId)).toBe(true);
      expect(bundle.programs.some((program) => program.id === item.programId)).toBe(true);
    }
    expect(bundle.localTodayByLocation[bundle.selectedLocationId!]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("los identificadores cumplen el formato que exigen los componentes", () => {
    const now = new Date("2026-11-14T10:00:00Z");
    const view = demoAttendanceView(now);
    const ids = [
      DEMO_ORGANIZATION_ID,
      demoOwnerScope().member.id,
      ...demoOwnerScope().locations.map((location) => location.id),
      ...demoClassesBundle(now).classes.map((item) => item.id),
      ...demoTodaySessions(now).sessions.map((session) => session.id),
      ...view.sessions.map((session) => session.id),
      ...demoOpenCharges(now).flatMap((charge) => [charge.chargeId, charge.familyId, charge.locationId]),
      ...demoFamilyAcademy().athletes.map((athlete) => athlete.athleteId),
    ];
    for (const value of ids) expect(value, value).toMatch(COMPONENT_UUID);
  });

  it("todo es ficticio: apellidos de prueba, sin siglas, sin correos, teléfonos ni direcciones web", () => {
    const now = new Date("2026-11-14T10:00:00Z");
    const view = demoAttendanceView(now);
    expect(view.initialSessionId).not.toBeNull();
    const intake = demoApiResponders
      .map((responder) => responder({ pathname: "/api/v1/owner/athlete-intake", searchParams: new URLSearchParams("page=1") }))
      .find((body) => body !== undefined);
    expect(intake).toBeDefined();
    const everything = JSON.stringify([
      intake,
      demoOwnerScope(),
      demoOperationalSummary(now),
      demoTodaySessions(now),
      demoAttentionItems(),
      demoClassesBundle(now),
      view,
      demoOpenCharges(now),
      demoFamilyAcademy(),
      demoFamilyFees(now),
      demoFamilyAthleteOverview(demoFamilyAcademy().athletes[0].athleteId, now),
    ]).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "");
    expect(everything).not.toMatch(/@|https?:|www\./i);
    expect(everything).not.toMatch(/\+?\d{9,}/);
    // Sin apellidos reales (aunque sean nombres de aparato) y sin siglas en lo que se ve.
    expect(everything).not.toMatch(/\bGAF\b|\bGAM\b|\bGR\b/);
    for (const surname of REAL_SURNAMES) expect(everything, surname).not.toMatch(new RegExp(`\\b${surname}\\b`));
    // Todos los apellidos de las gimnastas que se ven en la asistencia salen de la lista de prueba.
    const rosterSurnames = new Set(
      (demoFamilyAcademy().athletes.map((athlete) => athlete.displayName.split(" ")[1]))
    );
    for (const surname of rosterSurnames) expect(FICTIONAL_SURNAMES).toContain(surname);
    for (const academy of [demoFamilyAcademy()]) {
      for (const athlete of academy.athletes) {
        expect(FICTIONAL_SURNAMES).toContain(athlete.displayName.split(" ")[1]);
      }
    }
    for (const charge of demoOpenCharges(now)) {
      expect(FICTIONAL_SURNAMES.map((name) => `Familia ${name}`)).toContain(charge.payerName);
    }
  });

  it("los importes cuadran", () => {
    const now = new Date("2026-11-14T10:00:00Z");
    for (const charge of demoOpenCharges(now)) {
      expect(charge.outstandingCents).toBe(charge.totalCents - charge.allocatedCents);
      expect(charge.outstandingCents).toBeGreaterThan(0);
    }
    for (const academy of demoFamilyFees(now)) {
      for (const fee of academy.fees) expect(fee.pendingCents).toBe(fee.totalCents - fee.paidCents);
    }
  });

  it("el portal de familia solo conoce a las gimnastas de la familia de la demo", () => {
    const now = new Date("2026-11-14T10:00:00Z");
    const { athletes } = demoFamilyAcademy();
    expect(athletes.length).toBeGreaterThan(0);
    for (const athlete of athletes) {
      expect(isDemoFamilyAthlete(athlete.athleteId)).toBe(true);
      const overview = demoFamilyAthleteOverview(athlete.athleteId, now);
      expect(overview?.classes.length).toBeGreaterThan(0);
      expect(overview?.upcomingSessions.length).toBeGreaterThan(0);
    }
    expect(demoFamilyAthleteOverview("de000000-0000-4000-8000-000000009999", now)).toBeNull();
    expect(isDemoFamilyAthlete("00000000-0000-4000-8000-000000000001")).toBe(false);
  });
});
