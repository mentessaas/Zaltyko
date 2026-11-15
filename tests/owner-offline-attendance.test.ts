import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flushQueue, recordMark, type Batch, type SendResult } from "@/lib/offline-attendance/queue";
import { interpretSyncResponse, refreshTodaySnapshot, sendBatch } from "@/lib/offline-attendance/runtime";
import { saveSnapshot } from "@/lib/offline-attendance/snapshot";
import { createMemoryStore } from "@/lib/offline-attendance/store";

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const OTHER_SESSION = "33333333-3333-4333-8333-333333333334";
const ENROLLMENT = "44444444-4444-4444-8444-444444444441";
const OTHER_ENROLLMENT = "44444444-4444-4444-8444-444444444442";

const mark = (athleteId: string, extra: Record<string, unknown> = {}) => ({
  userId: USER,
  academyId: ORG,
  sessionId: SESSION,
  athleteId,
  status: "present" as const,
  now: new Date("2026-11-15T09:00:00.000Z"),
  ...extra,
});

describe("la cola lleva el modelo de datos de cada marca", () => {
  it("guarda source «owner» y los lotes de /owner salen marcados como tal", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(ENROLLMENT, { source: "owner" }));
    expect((await store.listQueued())[0].source).toBe("owner");

    const send = vi.fn(async (batch: Batch): Promise<SendResult> => ({
      kind: "ok",
      results: batch.entries.map((e) => ({ athleteId: e.athleteId, outcome: "applied" as const })),
    }));
    const summary = await flushQueue(store, send, { userId: USER });
    expect(summary.sent).toBe(1);
    expect(send.mock.calls[0][0]).toMatchObject({ source: "owner", academyId: ORG, sessionId: SESSION });
    expect(send.mock.calls[0][0].entries[0].athleteId).toBe(ENROLLMENT);
  });

  it("las marcas del panel antiguo no llevan source y no se mezclan con las de /owner en un lote", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(ENROLLMENT, { source: "owner" }));
    await recordMark(store, mark(OTHER_ENROLLMENT, { sessionId: OTHER_SESSION }));
    const send = vi.fn(async (batch: Batch): Promise<SendResult> => ({
      kind: "ok",
      results: batch.entries.map((e) => ({ athleteId: e.athleteId, outcome: "applied" as const })),
    }));
    await flushQueue(store, send, { userId: USER });
    const batches = send.mock.calls.map(([batch]) => batch);
    expect(batches).toHaveLength(2);
    expect(batches.find((b) => b.sessionId === SESSION)?.source).toBe("owner");
    const legacy = batches.find((b) => b.sessionId === OTHER_SESSION)!;
    expect(legacy.source).toBeUndefined();
    expect("source" in legacy).toBe(false);
  });

  it("la última marca sigue sustituyendo a la anterior y conserva lo que se veía al principio", async () => {
    const store = createMemoryStore();
    await recordMark(store, mark(ENROLLMENT, { source: "owner", seenRecordedAt: "2026-11-15T08:00:00.000Z" }));
    await recordMark(store, mark(ENROLLMENT, { source: "owner", status: "absent", seenRecordedAt: "2026-11-15T08:59:00.000Z" }));
    const all = await store.listQueued();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: "absent", seenRecordedAt: "2026-11-15T08:00:00.000Z", source: "owner" });
  });
});

describe("respuesta de POST /api/v1/owner/attendance/sync", () => {
  const results = [
    { opId: "a", sessionId: SESSION, enrollmentId: ENROLLMENT, outcome: "applied", recordedAt: "2026-11-15T09:00:00.000Z" },
    { opId: "b", sessionId: SESSION, enrollmentId: OTHER_ENROLLMENT, outcome: "superseded", recordedAt: "2026-11-15T09:30:00.000Z" },
  ];

  it("convierte cada inscripción en la «gimnasta» de la cola", () => {
    expect(interpretSyncResponse(200, { ok: true, data: { results } }, [ENROLLMENT, OTHER_ENROLLMENT], "enrollmentId")).toEqual({
      kind: "ok",
      results: [
        { athleteId: ENROLLMENT, outcome: "applied", recordedAt: "2026-11-15T09:00:00.000Z" },
        { athleteId: OTHER_ENROLLMENT, outcome: "superseded", recordedAt: "2026-11-15T09:30:00.000Z" },
      ],
    });
  });

  it.each([
    [401, { kind: "unauthorized" }],
    [503, { kind: "retry" }],
    [429, { kind: "retry" }],
    [404, { kind: "rejected", status: 404, code: undefined }],
    [409, { kind: "rejected", status: 409, code: undefined }],
  ])("estado %s", (status, expected) => {
    expect(interpretSyncResponse(status, { title: "x" }, [ENROLLMENT], "enrollmentId")).toEqual(expected);
  });
});

describe("envío y descarga de /owner", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const ownerBatch: Batch = {
    source: "owner",
    academyId: ORG,
    sessionId: SESSION,
    entries: [
      { athleteId: ENROLLMENT, status: "present", markedAt: "2026-11-15T09:00:00.000Z", opId: "a", seenRecordedAt: null },
    ],
  };

  it("las marcas de /owner van a /api/v1/owner/attendance/sync con la inscripción y la hora del móvil", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { results: [{ opId: "a", sessionId: SESSION, enrollmentId: ENROLLMENT, outcome: "duplicate", recordedAt: "2026-11-15T09:00:00.000Z" }] },
        }),
        { status: 200 }
      )
    );
    const result = await sendBatch(ownerBatch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/owner/attendance/sync");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      organizationId: ORG,
      entries: [{ opId: "a", sessionId: SESSION, enrollmentId: ENROLLMENT, status: "present", markedAt: "2026-11-15T09:00:00.000Z", seenRecordedAt: null }],
    });
    expect(Date.parse(body.sentAt)).not.toBeNaN();
    expect(body.entries[0]).not.toHaveProperty("athleteId");
    expect(result).toEqual({
      kind: "ok",
      results: [{ athleteId: ENROLLMENT, outcome: "duplicate", recordedAt: "2026-11-15T09:00:00.000Z" }],
    });
  });

  it("las del panel antiguo siguen yendo a /api/attendance", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { results: [] } }), { status: 200 }));
    await sendBatch({ ...ownerBatch, source: undefined });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/attendance");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).entries[0]).toHaveProperty("athleteId", ENROLLMENT);
  });

  it("sin cobertura (fetch falla) o con respuesta que no es de Zaltyko se reintenta", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await sendBatch(ownerBatch)).toEqual({ kind: "retry" });
    fetchMock.mockResolvedValueOnce(new Response("<html>portal cautivo</html>", { status: 200 }));
    expect(await sendBatch(ownerBatch)).toEqual({ kind: "retry" });
  });

  it("descarga la lista de hoy de /owner y la guarda con su origen, aunque la respuesta diga otra academia", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            source: "owner",
            academyId: "otra",
            academyName: "QA",
            userId: USER,
            date: "2026-11-15",
            generatedAt: "2026-11-15T08:00:00.000Z",
            sessions: [
              {
                id: SESSION,
                classId: "c1",
                className: "Nivel 1",
                startTime: "17:00",
                endTime: "18:00",
                athletes: [{ id: ENROLLMENT, name: "Gimnasta sintética", groupName: null }],
                marks: {
                  [ENROLLMENT]: { status: "present", recordedAt: "2026-11-15T07:00:00.000Z" },
                  malo: { status: "volando", recordedAt: null },
                },
              },
            ],
          },
        }),
        { status: 200 }
      )
    );
    const snapshot = await refreshTodaySnapshot(ORG, "owner");
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/v1/owner/attendance/today?organizationId=${ORG}`);
    expect(snapshot).toMatchObject({ source: "owner", academyId: ORG, userId: USER, date: "2026-11-15" });
    expect(Object.keys(snapshot!.sessions[0].marks)).toEqual([ENROLLMENT]);
  });

  it("el panel antiguo sigue descargando de /api/attendance/today", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    await refreshTodaySnapshot(ORG);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/attendance/today?academyId=${ORG}`);
  });
});

describe("lista guardada de /owner", () => {
  it("conserva el origen en el dispositivo y no lo añade a las listas antiguas", async () => {
    const store = createMemoryStore();
    const base = {
      academyId: ORG,
      academyName: "QA",
      userId: USER,
      date: "2026-11-15",
      generatedAt: "2026-11-15T08:00:00.000Z",
      sessions: [],
    };
    const owner = await saveSnapshot(store, { ...base, source: "owner" });
    const legacy = await saveSnapshot(store, { ...base, academyId: "otra" });
    expect(owner.source).toBe("owner");
    expect("source" in legacy).toBe(false);
  });
});
