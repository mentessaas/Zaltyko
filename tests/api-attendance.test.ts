import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { attendanceRecords, auditLogs } from "@/db/schema";

let POST: typeof import("@/app/api/attendance/route").POST;
let GET: typeof import("@/app/api/attendance/route").GET;

let insertCalls: Array<{ table: unknown; payload: unknown }> = [];
let classAthletes: Array<{
  id: string;
  primarySportConfigId: string | null;
  groupSportConfigId: string | null;
}> = [];
let coachClassScope = { allowed: true as boolean, reason: undefined as string | undefined };
let operationalWriteFailure: Error | null = null;

const createSelectChain = (resolveAt: "limit" | "where", result: any[]) => {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.then = (resolve: (value: any[]) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
};

const originalEnv = { ...process.env };
let selectQueue: any[] = [];

describe("API /api/attendance", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };
    selectQueue = [];
    insertCalls = [];
    classAthletes = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        primarySportConfigId: null,
        groupSportConfigId: null,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        primarySportConfigId: null,
        groupSportConfigId: null,
      },
    ];
    coachClassScope = { allowed: true, reason: undefined };
    operationalWriteFailure = null;

    vi.doMock("@/lib/authz", () => ({
      withTenant:
        (handler: (request: Request, context: any) => Promise<Response>) =>
        (request: Request, ctx: any = {}) =>
          handler(request, {
            tenantId: "tenant-123",
            userId: "user-456",
            profile: { id: "profile-1", role: "admin", tenantId: "tenant-123" },
            ...ctx,
          }),
    }));

    vi.doMock("@/db", () => ({
      db: {
        insert: vi.fn((table) => ({
          values: (payload: unknown) => {
            insertCalls.push({ table, payload });
            return {
              onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            };
          },
        })),
        select: vi.fn(() => {
          const chain = selectQueue.shift();
          if (!chain) {
            throw new Error("Select queue exhausted");
          }
          return chain;
        }),
      },
    }));

    vi.doMock("@/lib/classes/get-class-athletes", () => ({
      getClassAthletes: vi.fn(async () => classAthletes),
    }));

    vi.doMock("@/lib/attendance/service", () => ({
      verifyAttendanceWriteAccess: vi.fn(async () => coachClassScope),
    }));

    vi.doMock("@/lib/limits", () => ({
      lockAcademyOperationalWrites: vi.fn().mockResolvedValue(undefined),
      assertAcademyOperationalWritable: vi.fn(async () => {
        if (operationalWriteFailure) throw operationalWriteFailure;
      }),
    }));

    const attendanceModule = await import("@/app/api/attendance/route");
    POST = attendanceModule.POST;
    GET = attendanceModule.GET;
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("registra asistencia con múltiples entradas", async () => {
    selectQueue.push(
      createSelectChain("limit", [
        {
          id: "11111111-1111-4111-8111-111111111111",
          classId: "44444444-4444-4444-8444-444444444444",
          academyId: "55555555-5555-4555-8555-555555555555",
          sessionSportConfigId: null,
          classSportConfigId: null,
        },
      ])
    );

    // Registros que ya había para esas gimnastas (ninguno).
    selectQueue.push(createSelectChain("limit", []));

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "11111111-1111-4111-8111-111111111111",
        entries: [
          { athleteId: "22222222-2222-4222-8222-222222222222", status: "present" },
          {
            athleteId: "33333333-3333-4333-8333-333333333333",
            status: "late",
            notes: "Llegó 5 minutos tarde",
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, {} as any);
    expect(response.status).toBe(200);
    // Además de las dos filas de asistencia se persiste el hito de producto
    // idempotente `first_attendance_recorded`.
    expect(insertCalls.length).toBeGreaterThanOrEqual(2);
    const body = await response.json();
    expect(body.data.results).toEqual([
      { athleteId: "22222222-2222-4222-8222-222222222222", outcome: "applied" },
      { athleteId: "33333333-3333-4333-8333-333333333333", outcome: "applied" },
    ]);
  });

  describe("marcas de la cola sin conexión", () => {
    const SESSION = "11111111-1111-4111-8111-111111111111";
    const A1 = "22222222-2222-4222-8222-222222222222";
    const OP = "77777777-7777-4777-8777-777777777777";

    const pushSession = () =>
      selectQueue.push(
        createSelectChain("limit", [
          {
            id: SESSION,
            classId: "44444444-4444-4444-8444-444444444444",
            academyId: "55555555-5555-4555-8555-555555555555",
            sessionSportConfigId: null,
            classSportConfigId: null,
          },
        ])
      );

    const post = (entry: Record<string, unknown>) =>
      POST(
        new Request("http://localhost/api/attendance", {
          method: "POST",
          body: JSON.stringify({ sessionId: SESSION, entries: [{ athleteId: A1, ...entry }] }),
          headers: { "Content-Type": "application/json" },
        }),
        {} as any
      );

    const rowsFor = (table: unknown) => insertCalls.filter((call) => call.table === table);

    it("guarda la hora real de la marca, no la de llegada", async () => {
      pushSession();
      selectQueue.push(createSelectChain("limit", []));
      const response = await post({ status: "absent", markedAt: "2026-11-14T17:00:00.000Z", opId: OP });
      expect(response.status).toBe(200);
      const [row] = rowsFor(attendanceRecords);
      expect((row.payload as any).recordedAt.toISOString()).toBe("2026-11-14T17:00:00.000Z");
    });

    it("reenviar la misma marca no escribe nada (idempotente)", async () => {
      pushSession();
      selectQueue.push(
        createSelectChain("limit", [
          { athleteId: A1, status: "absent", notes: null, recordedAt: new Date("2026-11-14T17:00:00.000Z") },
        ])
      );
      const response = await post({ status: "absent", markedAt: "2026-11-14T17:00:00.000Z", opId: OP });
      const body = await response.json();
      expect(body.data.results).toEqual([{ athleteId: A1, outcome: "duplicate" }]);
      expect(rowsFor(attendanceRecords)).toHaveLength(0);
      expect(rowsFor(auditLogs)).toHaveLength(0);
    });

    it("una marca más antigua que la del servidor se descarta y queda registrada", async () => {
      pushSession();
      selectQueue.push(
        createSelectChain("limit", [
          { athleteId: A1, status: "present", notes: null, recordedAt: new Date("2026-11-14T17:30:00.000Z") },
        ])
      );
      const response = await post({ status: "absent", markedAt: "2026-11-14T17:00:00.000Z", opId: OP });
      const body = await response.json();
      expect(body.data.results).toEqual([{ athleteId: A1, outcome: "superseded" }]);
      expect(rowsFor(attendanceRecords)).toHaveLength(0);
      const [log] = rowsFor(auditLogs);
      expect((log.payload as any).action).toBe("attendance.offline_conflict");
      expect((log.payload as any).meta.conflicts[0]).toMatchObject({ athleteId: A1, opId: OP, outcome: "superseded" });
    });

    it("una marca más reciente gana a la del servidor y deja registro del valor pisado", async () => {
      pushSession();
      selectQueue.push(
        createSelectChain("limit", [
          { athleteId: A1, status: "present", notes: null, recordedAt: new Date("2026-11-14T17:00:00.000Z") },
        ])
      );
      const response = await post({ status: "late", markedAt: "2026-11-14T17:10:00.000Z", opId: OP });
      const body = await response.json();
      expect(body.data.results).toEqual([{ athleteId: A1, outcome: "applied" }]);
      expect(rowsFor(attendanceRecords)).toHaveLength(1);
      const [log] = rowsFor(auditLogs);
      expect((log.payload as any).meta.conflicts[0].existing.status).toBe("present");
    });

    it("el guardado en línea (sin opId) no genera registro de conflictos", async () => {
      pushSession();
      selectQueue.push(
        createSelectChain("limit", [
          { athleteId: A1, status: "present", notes: null, recordedAt: new Date("2026-11-14T17:00:00.000Z") },
        ])
      );
      const response = await post({ status: "absent" });
      expect(response.status).toBe(200);
      expect(rowsFor(attendanceRecords)).toHaveLength(1);
      expect(rowsFor(auditLogs)).toHaveLength(0);
    });

    it("rechaza una fecha de marca mal formada", async () => {
      pushSession();
      const response = await post({ status: "absent", markedAt: "ayer", opId: OP });
      expect(response.status).toBe(400);
    });
  });

  it("rechaza asistencia en solo lectura antes de crear registros", async () => {
    operationalWriteFailure = Object.assign(new Error("PLAN_OVER_CAPACITY"), { status: 409 });
    selectQueue.push(
      createSelectChain("limit", [
        {
          id: "11111111-1111-4111-8111-111111111111",
          classId: "44444444-4444-4444-8444-444444444444",
          academyId: "55555555-5555-4555-8555-555555555555",
          sessionSportConfigId: null,
          classSportConfigId: null,
        },
      ])
    );
    const response = await POST(new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "11111111-1111-4111-8111-111111111111",
        entries: [{ athleteId: "22222222-2222-4222-8222-222222222222" }],
      }),
      headers: { "Content-Type": "application/json" },
    }), {} as any);

    expect(response.status).toBe(409);
    expect(insertCalls).toHaveLength(0);
  });

  it("rechaza registro de asistencia cuando el entrenador no está asignado a la clase", async () => {
    coachClassScope = { allowed: false, reason: "COACH_NOT_ASSIGNED_TO_CLASS" };
    selectQueue.push(
      createSelectChain("limit", [
        {
          id: "11111111-1111-4111-8111-111111111111",
          classId: "44444444-4444-4444-8444-444444444444",
          academyId: "55555555-5555-4555-8555-555555555555",
          sessionSportConfigId: null,
          classSportConfigId: null,
        },
      ])
    );

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "11111111-1111-4111-8111-111111111111",
        entries: [
          { athleteId: "22222222-2222-4222-8222-222222222222", status: "present" },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, {
      profile: { id: "profile-1", role: "coach", tenantId: "tenant-123" },
    } as any);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("COACH_NOT_ASSIGNED_TO_CLASS");
    expect(insertCalls).toHaveLength(0);
  });

  it("lista registros de asistencia por sesión", async () => {
    selectQueue.push(
      createSelectChain("limit", [
        {
          classId: "44444444-4444-4444-8444-444444444444",
          academyId: "55555555-5555-4555-8555-555555555555",
        },
      ])
    );
    selectQueue.push(
      createSelectChain("where", [
        {
          id: "attendance-1",
          sessionId: "11111111-1111-4111-8111-111111111111",
          athleteId: "22222222-2222-4222-8222-222222222222",
          status: "present",
          notes: "Gran ejecución",
          recordedAt: new Date().toISOString(),
        },
      ])
    );

    const request = new Request(
      "http://localhost/api/attendance?sessionId=11111111-1111-4111-8111-111111111111",
      {
        method: "GET",
      }
    );

    const response = await GET(request, {} as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({
      sessionId: "11111111-1111-4111-8111-111111111111",
      status: "present",
    });
  });
});
