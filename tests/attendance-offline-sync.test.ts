import { describe, expect, it } from "vitest";

import { decideMark, resolveMarkedAt } from "@/lib/attendance/offline-sync";

const t = (iso: string) => new Date(iso);
const existing = (status: string, at: string, notes: string | null = null) => ({ status, notes, recordedAt: t(at) });

describe("última marca gana", () => {
  it("sin registro previo se aplica", () => {
    expect(decideMark(undefined, { status: "present", notes: null, markedAt: t("2026-11-14T17:00:00Z") })).toEqual({
      outcome: "applied",
      conflict: false,
    });
  });

  it("una marca más reciente gana y es conflicto si pisa otro valor", () => {
    const d = decideMark(existing("present", "2026-11-14T17:00:00Z"), {
      status: "absent",
      notes: null,
      markedAt: t("2026-11-14T17:05:00Z"),
    });
    expect(d).toEqual({ outcome: "applied", conflict: true });
  });

  it("más reciente con el mismo valor no es conflicto", () => {
    const d = decideMark(existing("present", "2026-11-14T17:00:00Z"), {
      status: "present",
      notes: null,
      markedAt: t("2026-11-14T17:05:00Z"),
    });
    expect(d).toEqual({ outcome: "applied", conflict: false });
  });

  it("una marca más antigua con otro valor se descarta y queda como conflicto", () => {
    const d = decideMark(existing("absent", "2026-11-14T17:05:00Z"), {
      status: "present",
      notes: null,
      markedAt: t("2026-11-14T17:00:00Z"),
    });
    expect(d).toEqual({ outcome: "superseded", conflict: true });
  });

  it("reenviar la misma marca es un duplicado sin cambios (idempotente)", () => {
    const row = existing("late", "2026-11-14T17:00:00Z");
    const incoming = { status: "late", notes: null, markedAt: t("2026-11-14T17:00:00Z") };
    expect(decideMark(row, incoming)).toEqual({ outcome: "duplicate", conflict: false });
    // y si el reenvío llega con un valor igual pero hora anterior, tampoco cambia nada
    expect(decideMark(row, { ...incoming, markedAt: t("2026-11-14T16:00:00Z") })).toEqual({
      outcome: "duplicate",
      conflict: false,
    });
  });

  it("empate de hora con otro valor: se queda el que ya estaba", () => {
    const d = decideMark(existing("present", "2026-11-14T17:00:00Z"), {
      status: "absent",
      notes: null,
      markedAt: t("2026-11-14T17:00:00Z"),
    });
    expect(d.outcome).toBe("superseded");
  });
});

describe("resolveMarkedAt", () => {
  const now = t("2026-11-14T18:00:00Z");
  it("sin fecha o con fecha rota usa ahora", () => {
    expect(resolveMarkedAt(undefined, now)).toBe(now);
    expect(resolveMarkedAt("no-es-fecha", now)).toBe(now);
  });
  it("respeta una fecha pasada", () => {
    expect(resolveMarkedAt("2026-11-14T17:00:00.000Z", now).toISOString()).toBe("2026-11-14T17:00:00.000Z");
  });
  it("acota a ahora una fecha del futuro (reloj adelantado)", () => {
    expect(resolveMarkedAt("2026-11-15T17:00:00.000Z", now)).toBe(now);
  });
});
