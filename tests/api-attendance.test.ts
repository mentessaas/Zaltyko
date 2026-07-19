import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { attendanceRecords } from "@/db/schema";

let POST: typeof import("@/app/api/attendance/route").POST;
let GET: typeof import("@/app/api/attendance/route").GET;

let insertCalls: Array<{ table: unknown; payload: unknown }> = [];
let classAthletes: Array<{
  id: string;
  primarySportConfigId: string | null;
  groupSportConfigId: string | null;
}> = [];
let coachClassScope = { allowed: true as boolean, reason: undefined as string | undefined };

const createSelectChain = (resolveAt: "limit" | "where", result: any[]) => {
  if (resolveAt === "limit") {
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(result)),
        })),
      })),
    };
  }

  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(result)),
      })),
    })),
  };
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
        id: "22222222-2222-2222-2222-222222222222",
        primarySportConfigId: null,
        groupSportConfigId: null,
      },
      {
        id: "33333333-3333-3333-3333-333333333333",
        primarySportConfigId: null,
        groupSportConfigId: null,
      },
    ];
    coachClassScope = { allowed: true, reason: undefined };

    vi.mock("@/lib/authz", () => ({
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

    vi.mock("@/db", () => ({
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

    vi.mock("@/lib/classes/get-class-athletes", () => ({
      getClassAthletes: vi.fn(async () => classAthletes),
    }));

    vi.mock("@/lib/permissions", () => ({
      verifyCoachClassScope: vi.fn(async () => coachClassScope),
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
          id: "11111111-1111-1111-1111-111111111111",
          classId: "44444444-4444-4444-4444-444444444444",
          academyId: "55555555-5555-5555-5555-555555555555",
          sessionSportConfigId: null,
          classSportConfigId: null,
        },
      ])
    );

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "11111111-1111-1111-1111-111111111111",
        entries: [
          { athleteId: "22222222-2222-2222-2222-222222222222", status: "present" },
          {
            athleteId: "33333333-3333-3333-3333-333333333333",
            status: "late",
            notes: "Llegó 5 minutos tarde",
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, {} as any);
    expect(response.status).toBe(200);
    expect(insertCalls.length).toBe(2);
  });

  it("rechaza registro de asistencia cuando el entrenador no está asignado a la clase", async () => {
    coachClassScope = { allowed: false, reason: "COACH_NOT_ASSIGNED_TO_CLASS" };
    selectQueue.push(
      createSelectChain("limit", [
        {
          id: "11111111-1111-1111-1111-111111111111",
          classId: "44444444-4444-4444-4444-444444444444",
          academyId: "55555555-5555-5555-5555-555555555555",
          sessionSportConfigId: null,
          classSportConfigId: null,
        },
      ])
    );

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "11111111-1111-1111-1111-111111111111",
        entries: [
          { athleteId: "22222222-2222-2222-2222-222222222222", status: "present" },
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
      createSelectChain("where", [
        {
          id: "attendance-1",
          sessionId: "11111111-1111-1111-1111-111111111111",
          athleteId: "22222222-2222-2222-2222-222222222222",
          status: "present",
          notes: "Gran ejecución",
          recordedAt: new Date().toISOString(),
        },
      ])
    );

    const request = new Request(
      "http://localhost/api/attendance?sessionId=11111111-1111-1111-1111-111111111111",
      {
        method: "GET",
      }
    );

    const response = await GET(request, {} as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      sessionId: "11111111-1111-1111-1111-111111111111",
      status: "present",
    });
  });
});
