import { describe, expect, it } from "vitest";

import {
  PAGE_CONFLICT_HORIZON_DAYS,
  SPACE_CONFLICT_WARNINGS_ENABLED,
  TRAVEL_BUFFER_MINUTES,
  coachConflictKind,
  describeConflict,
  gapMinutes,
  intervalsOverlap,
  orderedPair,
  safeTimezone,
  sortConflicts,
  spaceConflictKind,
  type ConflictSession,
  type ScheduleConflict,
} from "@/modules/schedule-conflicts/domain/schedule-conflicts";

function session(overrides: Partial<ConflictSession> & Pick<ConflictSession, "sessionId" | "startsAt" | "endsAt">): ConflictSession {
  return {
    classTemplateId: "c1",
    className: "Base 3 GAF",
    locationId: "norte",
    locationName: "Sede Norte",
    timezone: "Europe/Madrid",
    status: "scheduled",
    ...overrides,
  };
}

describe("solape de intervalos", () => {
  it("dos sesiones que se tocan en el minuto exacto no chocan", () => {
    const a = { startsAt: "2026-11-16T16:30:00Z", endsAt: "2026-11-16T18:00:00Z" };
    const b = { startsAt: "2026-11-16T18:00:00Z", endsAt: "2026-11-16T19:00:00Z" };
    expect(intervalsOverlap(a, b)).toBe(false);
    expect(intervalsOverlap(b, a)).toBe(false);
    expect(gapMinutes(a, b)).toBe(0);
  });

  it("un minuto de solape ya choca", () => {
    const a = { startsAt: "2026-11-16T16:30:00Z", endsAt: "2026-11-16T18:01:00Z" };
    const b = { startsAt: "2026-11-16T18:00:00Z", endsAt: "2026-11-16T19:00:00Z" };
    expect(intervalsOverlap(a, b)).toBe(true);
  });

  it("compara instantes, no horas locales: Madrid y Canarias", () => {
    // 18:00 en Madrid (UTC+1) y 17:30 en Canarias (UTC+0) son 17:00Z y 17:30Z.
    const madrid = { startsAt: "2026-11-16T18:00:00+01:00", endsAt: "2026-11-16T19:00:00+01:00" };
    const canarias = { startsAt: "2026-11-16T17:30:00+00:00", endsAt: "2026-11-16T18:30:00+00:00" };
    expect(intervalsOverlap(madrid, canarias)).toBe(true);
    // Mismo reloj local (18:00) en las dos sedes, pero una hora de diferencia real.
    const canariasLocal18 = { startsAt: "2026-11-16T18:00:00+00:00", endsAt: "2026-11-16T19:00:00+00:00" };
    expect(intervalsOverlap(madrid, canariasLocal18)).toBe(false);
    expect(gapMinutes(madrid, canariasLocal18)).toBe(0);
  });
});

describe("choque de entrenadora", () => {
  const a = session({ sessionId: "a", startsAt: "2026-11-16T16:30:00Z", endsAt: "2026-11-16T18:00:00Z" });

  it("en la misma sede, solo si se solapan", () => {
    expect(coachConflictKind(a, session({ sessionId: "b", startsAt: "2026-11-16T17:30:00Z", endsAt: "2026-11-16T19:00:00Z" }))).toBe(
      "coach_overlap"
    );
    // Seguidas en la misma sede: no hay desplazamiento.
    expect(coachConflictKind(a, session({ sessionId: "b", startsAt: "2026-11-16T18:00:00Z", endsAt: "2026-11-16T19:00:00Z" }))).toBeNull();
  });

  it("en otra sede, también si no da tiempo a desplazarse", () => {
    const sur = { locationId: "sur", locationName: "Sede Sur" };
    expect(coachConflictKind(a, session({ sessionId: "b", ...sur, startsAt: "2026-11-16T17:00:00Z", endsAt: "2026-11-16T18:30:00Z" }))).toBe(
      "coach_overlap"
    );
    expect(coachConflictKind(a, session({ sessionId: "b", ...sur, startsAt: "2026-11-16T18:15:00Z", endsAt: "2026-11-16T19:00:00Z" }))).toBe(
      "coach_travel"
    );
    // Justo el margen: ya da tiempo.
    const later = new Date(Date.parse("2026-11-16T18:00:00Z") + TRAVEL_BUFFER_MINUTES * 60_000).toISOString();
    expect(coachConflictKind(a, session({ sessionId: "b", ...sur, startsAt: later, endsAt: "2026-11-16T20:00:00Z" }))).toBeNull();
  });

  it("una sesión cancelada no cuenta, ni la misma sesión consigo misma", () => {
    const b = session({ sessionId: "b", startsAt: "2026-11-16T17:00:00Z", endsAt: "2026-11-16T18:00:00Z" });
    expect(coachConflictKind(a, { ...b, status: "cancelled" })).toBeNull();
    expect(coachConflictKind({ ...a, status: "cancelled" }, b)).toBeNull();
    expect(coachConflictKind(a, a)).toBeNull();
  });
});

describe("choque de pista", () => {
  const a = session({ sessionId: "a", startsAt: "2026-11-16T16:30:00Z", endsAt: "2026-11-16T18:00:00Z" });

  it("solo en la misma sede y solapándose; tocarse no es choque", () => {
    expect(spaceConflictKind(a, session({ sessionId: "b", startsAt: "2026-11-16T17:00:00Z", endsAt: "2026-11-16T18:30:00Z" }))).toBe(
      "space_overlap"
    );
    expect(spaceConflictKind(a, session({ sessionId: "b", startsAt: "2026-11-16T18:00:00Z", endsAt: "2026-11-16T19:00:00Z" }))).toBeNull();
    expect(
      spaceConflictKind(a, session({ sessionId: "b", locationId: "sur", startsAt: "2026-11-16T17:00:00Z", endsAt: "2026-11-16T18:30:00Z" }))
    ).toBeNull();
    expect(
      spaceConflictKind(a, session({ sessionId: "b", status: "cancelled", startsAt: "2026-11-16T17:00:00Z", endsAt: "2026-11-16T18:30:00Z" }))
    ).toBeNull();
  });
});

describe("texto del aviso", () => {
  const first = session({ sessionId: "a", startsAt: "2026-11-16T16:30:00Z", endsAt: "2026-11-16T18:00:00Z" });
  const second = session({
    sessionId: "b",
    className: "Iniciación",
    locationId: "sur",
    locationName: "Sede Sur",
    timezone: "Atlantic/Canary",
    startsAt: "2026-11-16T18:10:00Z",
    endsAt: "2026-11-16T19:00:00Z",
  });

  it("dice quién, qué sesiones y cuándo, en la hora de cada sede", () => {
    const travel: ScheduleConflict = { kind: "coach_travel", subjectId: "ana", subjectName: "Ana Ruiz", first, second };
    const text = describeConflict(travel);
    expect(text).toContain("Ana Ruiz");
    expect(text).toContain("«Base 3 GAF»");
    expect(text).toContain("«Iniciación»");
    expect(text).toContain("17:30–19:00, Sede Norte"); // Madrid, UTC+1
    expect(text).toContain("18:10–19:00, Sede Sur"); // Canarias, UTC+0
    expect(text).toContain(`${TRAVEL_BUFFER_MINUTES} minutos`);
    expect(describeConflict({ ...travel, kind: "coach_overlap" })).toContain("dos sesiones a la vez");
    expect(describeConflict({ ...travel, kind: "space_overlap", subjectName: "Practicable" })).toContain("La pista «Practicable»");
  });

  it("ordena por la sesión más próxima y pone primero la que empieza antes", () => {
    expect(orderedPair(second, first)).toEqual([first, second]);
    const later: ScheduleConflict = { kind: "space_overlap", subjectId: "p", subjectName: "Pista", first: second, second };
    const sooner: ScheduleConflict = { kind: "coach_overlap", subjectId: "ana", subjectName: "Ana", first, second };
    expect(sortConflicts([later, sooner])).toEqual([sooner, later]);
  });
});

describe("valores conservadores y robustez", () => {
  it("las páginas miran 14 días y los avisos de pista están apagados", () => {
    expect(PAGE_CONFLICT_HORIZON_DAYS).toBe(14);
    expect(SPACE_CONFLICT_WARNINGS_ENABLED).toBe(false);
  });

  it("una zona horaria inválida no rompe el texto: usa UTC y lo indica", () => {
    expect(safeTimezone("Europe/Madrid")).toEqual({ timezone: "Europe/Madrid", fallback: false });
    expect(safeTimezone("Marte/Olimpo")).toEqual({ timezone: "UTC", fallback: true });
    const broken = session({ sessionId: "x", timezone: "Marte/Olimpo", startsAt: "2026-11-16T16:30:00Z", endsAt: "2026-11-16T18:00:00Z" });
    const other = session({ sessionId: "y", startsAt: "2026-11-16T17:00:00Z", endsAt: "2026-11-16T18:30:00Z" });
    const text = describeConflict({ kind: "coach_overlap", subjectId: "ana", subjectName: "Ana Ruiz", first: broken, second: other });
    expect(text).toContain("16:30–18:00 UTC, Sede Norte");
    expect(() => describeConflict({ kind: "coach_overlap", subjectId: "a", subjectName: "A", first: { ...broken, startsAt: "no es fecha" }, second: other })).not.toThrow();
  });
});

