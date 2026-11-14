import { describe, expect, it } from "vitest";

import { createMemoryStore } from "@/lib/offline-attendance/store";
import {
  getFreshSnapshots,
  isSnapshotExpired,
  mergeMarks,
  purgeExpiredSnapshots,
  saveSnapshot,
  type TodayPayload,
} from "@/lib/offline-attendance/snapshot";
import { interpretSyncResponse } from "@/lib/offline-attendance/runtime";
import type { QueuedMark } from "@/lib/offline-attendance/types";

const USER = "11111111-1111-4111-8111-111111111111";
const ACADEMY = "22222222-2222-4222-8222-222222222222";

const payload = (savedAt: string, userId = USER): TodayPayload => ({
  academyId: ACADEMY,
  academyName: "Academia Demo",
  userId,
  date: "2026-11-14",
  generatedAt: savedAt,
  sessions: [
    {
      id: "s1",
      classId: "c1",
      className: "Nivel 2",
      startTime: "17:00:00",
      endTime: null,
      athletes: [{ id: "a1", name: "Gimnasta Uno", groupName: "Grupo A" }],
      marks: { a1: { status: "present", recordedAt: savedAt } },
    },
  ],
});

describe("lista de hoy guardada en el dispositivo", () => {
  it("guarda solo identificador, nombre y grupo de cada gimnasta", async () => {
    const store = createMemoryStore();
    const snapshot = await saveSnapshot(store, payload("2026-11-14T16:00:00.000Z"));
    expect(Object.keys(snapshot.sessions[0].athletes[0]).sort()).toEqual(["groupName", "id", "name"]);
  });

  it("caduca a las 36 horas y se purga", async () => {
    const store = createMemoryStore();
    const snap = await saveSnapshot(store, payload("2026-11-12T00:00:00.000Z"));
    const fresh = await saveSnapshot(store, { ...payload("2026-11-14T10:00:00.000Z"), academyId: "other" });
    const now = new Date("2026-11-14T12:00:00.000Z");
    expect(isSnapshotExpired(snap, now)).toBe(true);
    expect(isSnapshotExpired(fresh, now)).toBe(false);
    expect(await purgeExpiredSnapshots(store, now)).toBe(1);
    expect((await store.listSnapshots()).map((s) => s.key)).toEqual([fresh.key]);
  });

  it("solo devuelve las listas vigentes de la usuaria actual", async () => {
    const store = createMemoryStore();
    await saveSnapshot(store, payload("2026-11-14T10:00:00.000Z"));
    await saveSnapshot(store, payload("2026-11-14T10:00:00.000Z", "99999999-9999-4999-8999-999999999999"));
    const mine = await getFreshSnapshots(store, USER, new Date("2026-11-14T12:00:00.000Z"));
    expect(mine).toHaveLength(1);
    expect(mine[0].userId).toBe(USER);
  });

  it("mergeMarks pone las marcas pendientes encima de las del servidor", () => {
    const session = { id: "s1", marks: { a1: { status: "present" as const, recordedAt: null }, a2: { status: "late" as const, recordedAt: null } } };
    const queued = [
      { sessionId: "s1", athleteId: "a1", status: "absent", state: "pending" },
      { sessionId: "s1", athleteId: "a3", status: "present", state: "failed" },
      { sessionId: "otra", athleteId: "a2", status: "absent", state: "pending" },
    ] as QueuedMark[];
    expect(mergeMarks(session, queued)).toEqual({
      a1: { status: "absent", state: "pending" },
      a2: { status: "late", state: "saved" },
      a3: { status: "present", state: "failed" },
    });
  });
});

describe("interpretación de la respuesta del servidor", () => {
  it.each([
    [401, { kind: "unauthorized" }],
    [429, { kind: "retry" }],
    [503, { kind: "retry" }],
    [403, { kind: "rejected", status: 403, code: "COACH_NOT_ASSIGNED_TO_CLASS" }],
  ])("estado %i", (status, expected) => {
    expect(interpretSyncResponse(status as number, { code: "COACH_NOT_ASSIGNED_TO_CLASS" }, ["a1"])).toEqual(expected);
  });

  it("lee los resultados por gimnasta y ignora basura", () => {
    const result = interpretSyncResponse(
      200,
      { ok: true, data: { results: [{ athleteId: "a1", outcome: "duplicate" }, { athleteId: "a2", outcome: "raro" }, 7] } },
      ["a1", "a2"]
    );
    expect(result).toEqual({ kind: "ok", results: [{ athleteId: "a1", outcome: "duplicate" }] });
  });

  it("recoge lo que quedó guardado en el servidor para cada gimnasta", () => {
    const result = interpretSyncResponse(
      200,
      { ok: true, data: { results: [{ athleteId: "a1", outcome: "applied", recordedAt: "2026-11-14T17:00:00.000Z" }] } },
      ["a1"]
    );
    expect(result).toEqual({
      kind: "ok",
      results: [{ athleteId: "a1", outcome: "applied", recordedAt: "2026-11-14T17:00:00.000Z" }],
    });
  });

  it("un servidor sin resultados (versión antigua) da todo por aplicado", () => {
    expect(interpretSyncResponse(200, { ok: true, data: { ok: true } }, ["a1", "a2"])).toEqual({
      kind: "ok",
      results: [{ athleteId: "a1", outcome: "applied" }, { athleteId: "a2", outcome: "applied" }],
    });
  });
});
