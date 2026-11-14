import { describe, expect, it } from "vitest";

import { clockOffsetMs, decideMark, resolveMarkedAt } from "@/lib/attendance/offline-sync";

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

describe("conflicto según lo que la entrenadora veía", () => {
  const stored = existing("present", "2026-11-14T17:00:00Z");
  const incoming = (seen: Date | null | undefined, status = "absent", at = "2026-11-14T17:10:00Z") => ({
    status,
    notes: null,
    markedAt: t(at),
    seenRecordedAt: seen,
  });

  it("si el guardado sigue igual que lo visto, corregir lo propio no es conflicto", () => {
    expect(decideMark(stored, incoming(t("2026-11-14T17:00:00Z")))).toEqual({ outcome: "applied", conflict: false });
  });

  it("si alguien lo cambió después de lo visto, es conflicto", () => {
    expect(decideMark(stored, incoming(t("2026-11-14T16:30:00Z")))).toEqual({ outcome: "applied", conflict: true });
  });

  it("si no había marca al verlo y ya hay otra de otra persona, es conflicto", () => {
    expect(decideMark(stored, incoming(null))).toEqual({ outcome: "applied", conflict: true });
  });

  it("sin dato de lo visto (guardado en línea o versión antigua) vale la regla simple", () => {
    expect(decideMark(stored, incoming(undefined))).toEqual({ outcome: "applied", conflict: true });
    expect(decideMark(stored, incoming(undefined, "present"))).toEqual({ outcome: "applied", conflict: false });
  });

  it("una marca más antigua que la guardada siempre pierde y se registra", () => {
    expect(decideMark(stored, incoming(t("2026-11-14T17:00:00Z"), "absent", "2026-11-14T16:59:00Z"))).toEqual({
      outcome: "superseded",
      conflict: true,
    });
  });
});

describe("reloj del móvil", () => {
  const now = t("2026-11-14T18:00:00Z");

  it("sin hora de envío no compensa", () => {
    expect(clockOffsetMs(undefined, now)).toBe(0);
    expect(clockOffsetMs("rota", now)).toBe(0);
  });

  it("móvil atrasado 10 min: las marcas se adelantan 10 min", () => {
    const offset = clockOffsetMs("2026-11-14T17:50:00Z", now);
    expect(offset).toBe(10 * 60_000);
    expect(resolveMarkedAt("2026-11-14T17:00:00Z", now, offset).toISOString()).toBe("2026-11-14T17:10:00.000Z");
  });

  it("móvil adelantado 10 min: las marcas se retrasan 10 min en vez de quedar en el futuro", () => {
    const offset = clockOffsetMs("2026-11-14T18:10:00Z", now);
    expect(offset).toBe(-10 * 60_000);
    expect(resolveMarkedAt("2026-11-14T18:05:00Z", now, offset).toISOString()).toBe("2026-11-14T17:55:00.000Z");
  });

  it("la compensación nunca deja una marca por delante de ahora", () => {
    expect(resolveMarkedAt("2026-11-14T17:59:00Z", now, 5 * 60_000)).toBe(now);
  });
});
