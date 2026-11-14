import { describe, expect, it, vi } from "vitest";

import { flushQueue, recordMark, countPending, listFailed, purgeExpiredQueue, type Batch, type SendResult } from "@/lib/offline-attendance/queue";
import { createMemoryStore } from "@/lib/offline-attendance/store";
import { queueKey } from "@/lib/offline-attendance/types";

const USER = "11111111-1111-4111-8111-111111111111";
const ACADEMY = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const A1 = "44444444-4444-4444-8444-444444444441";
const A2 = "44444444-4444-4444-8444-444444444442";

const mark = (athleteId: string, status: "present" | "absent" | "late" | "excused", at: string, extra = {}) => ({
  userId: USER,
  academyId: ACADEMY,
  sessionId: SESSION,
  athleteId,
  status,
  now: new Date(at),
  ...extra,
});

const okAll = (outcome: "applied" | "duplicate" | "superseded" = "applied") =>
  vi.fn(async (batch: Batch): Promise<SendResult> => ({
    kind: "ok",
    results: batch.entries.map((e) => ({ athleteId: e.athleteId, outcome })),
  }));

describe("cola local de asistencia", () => {
  it("guarda una marca pendiente con la hora real y un identificador", async () => {
    const store = createMemoryStore();
    const saved = await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    expect(saved.state).toBe("pending");
    expect(saved.markedAt).toBe("2026-11-14T17:00:00.000Z");
    expect(saved.opId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await countPending(store, USER)).toBe(1);
  });

  it("la última marca de la misma gimnasta sustituye a la anterior", async () => {
    const store = createMemoryStore();
    const first = await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    const second = await recordMark(store, mark(A1, "absent", "2026-11-14T17:05:00.000Z"));
    const all = await store.listQueued();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("absent");
    expect(all[0].opId).toBe(second.opId);
    expect(all[0].opId).not.toBe(first.opId);
  });

  it("envía por sesión, vacía la cola y cuenta lo confirmado", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    await recordMark(store, mark(A2, "late", "2026-11-14T17:01:00.000Z"));
    const send = okAll();

    const summary = await flushQueue(store, send, { userId: USER });

    expect(send).toHaveBeenCalledTimes(1);
    const batch = send.mock.calls[0][0];
    expect(batch.sessionId).toBe(SESSION);
    expect(batch.entries.map((e) => e.athleteId)).toEqual([A1, A2]);
    expect(batch.entries[0]).toMatchObject({ status: "present", markedAt: "2026-11-14T17:00:00.000Z" });
    expect(summary).toMatchObject({ sent: 2, duplicates: 0, superseded: 0, failed: 0, remaining: 0 });
    expect(summary.confirmed).toHaveLength(2);
    expect(await store.listQueued()).toHaveLength(0);
  });

  it("sin red deja todo pendiente y se puede reintentar con el mismo opId (idempotencia)", async () => {
    const store = createMemoryStore();
    const saved = await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));

    const offline = vi.fn(async (): Promise<SendResult> => ({ kind: "retry" }));
    const first = await flushQueue(store, offline, { userId: USER });
    expect(first).toMatchObject({ sent: 0, remaining: 1, stoppedBecause: "offline" });

    const send = okAll("duplicate");
    const second = await flushQueue(store, send, { userId: USER });
    expect(send.mock.calls[0][0].entries[0].opId).toBe(saved.opId);
    expect(second).toMatchObject({ sent: 1, duplicates: 1, remaining: 0 });
  });

  it("una excepción al enviar cuenta como sin red, no pierde marcas", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    const summary = await flushQueue(store, async () => {
      throw new TypeError("Failed to fetch");
    }, { userId: USER });
    expect(summary.remaining).toBe(1);
    expect(summary.stoppedBecause).toBe("offline");
  });

  it("sesión caducada: para y conserva las marcas", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    const summary = await flushQueue(store, async () => ({ kind: "unauthorized" }), { userId: USER });
    expect(summary).toMatchObject({ remaining: 1, stoppedBecause: "unauthorized" });
  });

  it("marca descartada por una más reciente del servidor sale de la cola y se cuenta", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    const summary = await flushQueue(store, okAll("superseded"), { userId: USER });
    expect(summary).toMatchObject({ sent: 0, superseded: 1, remaining: 0 });
    expect(summary.supersededMarks[0].athleteId).toBe(A1);
    expect(await store.listQueued()).toHaveLength(0);
  });

  it("si el lote entero se rechaza, reintenta de una en una y solo falla la mala", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    await recordMark(store, mark(A2, "present", "2026-11-14T17:01:00.000Z"));
    const send = vi.fn(async (batch: Batch): Promise<SendResult> => {
      if (batch.entries.length > 1 || batch.entries[0].athleteId === A2) {
        return { kind: "rejected", status: 400, code: "ATHLETE_NOT_IN_CLASS" };
      }
      return { kind: "ok", results: [{ athleteId: A1, outcome: "applied" }] };
    });

    const summary = await flushQueue(store, send, { userId: USER });

    expect(summary).toMatchObject({ sent: 1, failed: 1, remaining: 0 });
    const failed = await listFailed(store, USER);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ athleteId: A2, state: "failed", lastError: "ATHLETE_NOT_IN_CLASS" });
    // Una marca fallida no se reenvía sola en bucle.
    const again = vi.fn(okAll());
    await flushQueue(store, again, { userId: USER });
    expect(again).not.toHaveBeenCalled();
  });

  it("una marca nueva hecha durante el envío no se borra al confirmarse la vieja", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    const send = vi.fn(async (batch: Batch): Promise<SendResult> => {
      // La entrenadora cambia la marca mientras la petición está en vuelo.
      await recordMark(store, mark(A1, "absent", "2026-11-14T17:00:30.000Z"));
      return { kind: "ok", results: batch.entries.map((e) => ({ athleteId: e.athleteId, outcome: "applied" as const })) };
    });

    const summary = await flushQueue(store, send, { userId: USER });

    expect(summary.sent).toBe(1);
    const left = await store.getQueued(queueKey(SESSION, A1, USER));
    expect(left?.status).toBe("absent");
    expect(summary.remaining).toBe(1);
  });

  it("conserva sin enviar las marcas de otra persona que usó el móvil", async () => {
    const store = createMemoryStore();
    const OTHER = "99999999-9999-4999-8999-999999999999";
    await recordMark(store, { ...mark(A1, "present", "2026-11-14T17:00:00.000Z"), userId: OTHER });
    const send = okAll();
    const summary = await flushQueue(store, send, { userId: USER });
    expect(send).not.toHaveBeenCalled();
    expect(summary.remaining).toBe(0);
    // siguen ahí, para cuando esa persona vuelva a entrar
    expect(await countPending(store, OTHER)).toBe(1);
    expect(await store.listQueued()).toHaveLength(1);
  });

  it("dos usuarias que marcan a la misma gimnasta no se pisan la cola", async () => {
    const store = createMemoryStore();
    const OTHER = "99999999-9999-4999-8999-999999999999";
    await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    await recordMark(store, { ...mark(A1, "absent", "2026-11-14T17:01:00.000Z"), userId: OTHER });
    expect(await store.listQueued()).toHaveLength(2);
    const send = okAll();
    await flushQueue(store, send, { userId: USER });
    expect(send.mock.calls[0][0].entries).toHaveLength(1);
    expect(send.mock.calls[0][0].entries[0].status).toBe("present");
    expect(await countPending(store, OTHER)).toBe(1);
  });

  it("manda lo que la entrenadora veía al marcar y lo conserva al corregir sin red", async () => {
    const store = createMemoryStore();
    await recordMark(store, { ...mark(A1, "present", "2026-11-14T17:00:00.000Z"), seenRecordedAt: "2026-11-14T16:00:00.000Z" });
    // segunda marca sin red sobre la misma gimnasta: lo «visto» sigue siendo lo del servidor
    await recordMark(store, { ...mark(A1, "late", "2026-11-14T17:02:00.000Z"), seenRecordedAt: "2026-11-14T17:00:00.000Z" });
    const send = okAll();
    await flushQueue(store, send, { userId: USER });
    expect(send.mock.calls[0][0].entries[0]).toMatchObject({
      status: "late",
      seenRecordedAt: "2026-11-14T16:00:00.000Z",
    });
  });

  it("sin marca previa manda seenRecordedAt null", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    const send = okAll();
    await flushQueue(store, send, { userId: USER });
    expect(send.mock.calls[0][0].entries[0].seenRecordedAt).toBeNull();
  });

  it("devuelve lo que quedó guardado en el servidor para cada marca confirmada", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    const summary = await flushQueue(
      store,
      async () => ({ kind: "ok", results: [{ athleteId: A1, outcome: "applied", recordedAt: "2026-11-14T17:00:01.000Z" }] }),
      { userId: USER }
    );
    expect(summary.confirmed[0].serverRecordedAt).toBe("2026-11-14T17:00:01.000Z");
  });

  describe("caducidad de la cola", () => {
    const now = new Date("2026-11-20T12:00:00.000Z");

    it("borra pendientes de más de 7 días y rechazadas de más de 3, de cualquier usuaria", async () => {
      const store = createMemoryStore();
      const OTHER = "99999999-9999-4999-8999-999999999999";
      const old = await recordMark(store, mark(A1, "present", "2026-11-12T12:00:00.000Z")); // 8 días
      const recent = await recordMark(store, mark(A2, "present", "2026-11-18T12:00:00.000Z")); // 2 días
      const failedOld = await recordMark(store, { ...mark(A2, "late", "2026-11-16T12:00:00.000Z"), userId: OTHER }); // 4 días
      await store.putQueued({ ...failedOld, state: "failed", lastError: "http-400" });
      const failedRecent = await recordMark(store, { ...mark(A1, "late", "2026-11-19T12:00:00.000Z"), userId: OTHER });
      await store.putQueued({ ...failedRecent, state: "failed", lastError: "http-400" });

      expect(await purgeExpiredQueue(store, now)).toBe(2);
      const left = (await store.listQueued()).map((m) => m.key).sort();
      expect(left).toEqual([recent.key, failedRecent.key].sort());
      expect(left).not.toContain(old.key);
    });
  });
  it("dos envíos a la vez comparten un solo envío", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    const send = okAll();
    const [a, b] = await Promise.all([
      flushQueue(store, send, { userId: USER }),
      flushQueue(store, send, { userId: USER }),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("parte los lotes grandes en trozos", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 230; i += 1) {
      const id = `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`;
      await recordMark(store, mark(id, "present", "2026-11-14T17:00:00.000Z"));
    }
    const send = okAll();
    const summary = await flushQueue(store, send, { userId: USER });
    expect(send.mock.calls.map((c) => c[0].entries.length)).toEqual([100, 100, 30]);
    expect(summary.sent).toBe(230);
  });

  it("clearAll borra listas y cola", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(A1, "present", "2026-11-14T17:00:00.000Z"));
    await store.putSnapshot({
      key: `${USER}:${ACADEMY}`, userId: USER, academyId: ACADEMY, academyName: null,
      date: "2026-11-14", savedAt: "2026-11-14T16:00:00.000Z", sessions: [],
    });
    await store.clearAll();
    expect(await store.listQueued()).toHaveLength(0);
    expect(await store.listSnapshots()).toHaveLength(0);
  });
});
