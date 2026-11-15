import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  rateLimit: vi.fn(),
  sessionRows: vi.fn(),
  access: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => mocks.sessionRows() }) }),
    }),
  },
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 60, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (_request: Request, organizationId: string) =>
    `verified:${organizationId}`,
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () => new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/modules/attendance/application/owner-session-attendance", () => ({
  resolveSessionAttendanceAccess: mocks.access,
}));
vi.mock("@/modules/attendance/application/attendance-service", () => ({
  recordOfflineAttendance: mocks.record,
}));

import { POST } from "@/app/api/v1/owner/attendance/sync/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const sessionId = "30000000-0000-4000-8000-000000000003";
const otherSessionId = "30000000-0000-4000-8000-000000000004";
const enrollmentId = "40000000-0000-4000-8000-000000000004";
const otherEnrollmentId = "40000000-0000-4000-8000-000000000005";
const userId = "50000000-0000-4000-8000-000000000005";
const memberId = "60000000-0000-4000-8000-000000000006";
const opA = "70000000-0000-4000-8000-00000000000a";
const opB = "70000000-0000-4000-8000-00000000000b";

const NOW = new Date("2026-11-15T10:00:00.000Z");

function entry(overrides: Record<string, unknown> = {}) {
  return {
    opId: opA,
    sessionId,
    enrollmentId,
    status: "present",
    markedAt: "2026-11-15T09:00:00.000Z",
    seenRecordedAt: null,
    ...overrides,
  };
}

function post(body: unknown) {
  return POST(
    new Request("https://example.invalid/api/v1/owner/attendance/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.sessionRows.mockResolvedValue([{ locationId }]);
  mocks.access.mockResolvedValue({ memberId, locationId, role: "coach" });
  mocks.record.mockImplementation(async (command: { enrollmentId: string }) => ({
    outcome: "applied",
    attendance: { recordedAt: new Date("2026-11-15T09:00:00.000Z"), enrollmentId: command.enrollmentId },
  }));
});

afterEach(() => vi.useRealTimers());

describe("POST /api/v1/owner/attendance/sync", () => {
  it("exige una persona verificada antes de validar el cuerpo", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect((await post({ nada: true })).status).toBe(401);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it.each([
    ["sin marcas", { organizationId, entries: [] }],
    ["más de 100 marcas", { organizationId, entries: Array.from({ length: 101 }, () => entry()) }],
    ["estado inventado", { organizationId, entries: [entry({ status: "volando" })] }],
    ["campo desconocido en la marca", { organizationId, entries: [entry({ memberId })] }],
    ["campo desconocido fuera", { organizationId, actor: userId, entries: [entry()] }],
    ["opId que no es un identificador", { organizationId, entries: [entry({ opId: "uno" })] }],
    ["hora rota", { organizationId, entries: [entry({ markedAt: "ayer" })] }],
  ])("rechaza el cuerpo inválido: %s", async (_name, body) => {
    expect((await post(body)).status).toBe(400);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("guarda cada marca con la clave del móvil, el actor verificado y la hora real", async () => {
    const response = await post({
      organizationId,
      sentAt: NOW.toISOString(),
      entries: [entry(), entry({ opId: opB, enrollmentId: otherEnrollmentId, status: "absent", seenRecordedAt: "2026-11-15T08:00:00.000Z" })],
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.data.results).toEqual([
      { opId: opA, sessionId, enrollmentId, outcome: "applied", recordedAt: "2026-11-15T09:00:00.000Z" },
      { opId: opB, sessionId, enrollmentId: otherEnrollmentId, outcome: "applied", recordedAt: "2026-11-15T09:00:00.000Z" },
    ]);
    expect(mocks.record).toHaveBeenCalledTimes(2);
    expect(mocks.record.mock.calls[0][0]).toMatchObject({
      organizationId,
      expectedLocationId: locationId,
      sessionId,
      enrollmentId,
      status: "present",
      idempotencyKey: `offline:${opA}`,
      actor: { userId, memberId },
      offline: { opId: opA, markedAt: new Date("2026-11-15T09:00:00.000Z"), seenRecordedAt: null },
    });
    expect(mocks.record.mock.calls[1][0].offline.seenRecordedAt).toEqual(new Date("2026-11-15T08:00:00.000Z"));
  });

  it("devuelve «ya estaba» y «sustituida» tal como los decide el servicio", async () => {
    mocks.record
      .mockResolvedValueOnce({ outcome: "duplicate", attendance: { recordedAt: new Date("2026-11-15T09:30:00.000Z") } })
      .mockResolvedValueOnce({ outcome: "superseded", attendance: { recordedAt: new Date("2026-11-15T09:45:00.000Z") } });
    const response = await post({
      organizationId,
      entries: [entry(), entry({ opId: opB, enrollmentId: otherEnrollmentId })],
    });
    const { results } = (await response.json()).data;
    expect(results.map((r: { outcome: string }) => r.outcome)).toEqual(["duplicate", "superseded"]);
    expect(results[1].recordedAt).toBe("2026-11-15T09:45:00.000Z");
  });

  it("corrige un reloj del móvil atrasado con la hora de envío (sentAt) y no deja marcas en el futuro", async () => {
    // El móvil dice que son las 07:00 cuando en realidad son las 10:00: va 3 h atrasado.
    await post({
      organizationId,
      sentAt: "2026-11-15T07:00:00.000Z",
      entries: [
        entry({ markedAt: "2026-11-15T06:30:00.000Z" }),
        entry({ opId: opB, enrollmentId: otherEnrollmentId, markedAt: "2026-11-15T08:30:00.000Z" }),
      ],
    });
    expect(mocks.record.mock.calls[0][0].offline.markedAt).toEqual(new Date("2026-11-15T09:30:00.000Z"));
    // 08:30 + 3 h = 11:30: ya sería futuro, se acota a «ahora».
    expect(mocks.record.mock.calls[1][0].offline.markedAt).toEqual(NOW);
  });

  it("una sesión que no existe (o de otra academia) responde 404 y no guarda nada del lote", async () => {
    mocks.sessionRows.mockResolvedValue([]);
    const response = await post({ organizationId, entries: [entry()] });
    expect(response.status).toBe(404);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("una sesión de otra sede de la entrenadora responde 404 y no guarda ninguna marca del lote", async () => {
    mocks.access
      .mockResolvedValueOnce({ memberId, locationId, role: "coach" })
      .mockRejectedValueOnce(new OperationalError("NOT_FOUND", "Sesión no encontrada", 404));
    const response = await post({
      organizationId,
      entries: [entry(), entry({ opId: opB, sessionId: otherSessionId })],
    });
    expect(response.status).toBe(404);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("resuelve el acceso una vez por sesión, no por marca", async () => {
    await post({
      organizationId,
      entries: [entry(), entry({ opId: opB, enrollmentId: otherEnrollmentId })],
    });
    expect(mocks.access).toHaveBeenCalledTimes(1);
    expect(mocks.access).toHaveBeenCalledWith({ userId, organizationId, locationId, sessionId });
  });

  it("aplica el límite por academia antes de escribir", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    const response = await post({ organizationId, entries: [entry()] });
    expect(response.status).toBe(429);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("un rechazo del servicio (inscripción que ya no está) llega como 4xx para que la cola lo aísle", async () => {
    mocks.record.mockRejectedValue(
      new OperationalError("INVALID_STATE_TRANSITION", "La inscripción no está activa para registrar asistencia", 409)
    );
    const response = await post({ organizationId, entries: [entry()] });
    expect(response.status).toBe(409);
  });

  it("un interbloqueo responde 503 (reintentable) y no 409 definitivo", async () => {
    mocks.record.mockRejectedValue(Object.assign(new Error("deadlock"), { code: "40P01" }));
    const response = await post({ organizationId, entries: [entry()] });
    expect(response.status).toBe(503);
  });
});
