import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { attendanceRecords } from "@/db/schema";

let POST: typeof import("@/app/api/attendance/route").POST;
let GET: typeof import("@/app/api/attendance/route").GET;

let insertCalls: Array<{ table: unknown; payload: unknown }> = [];

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
        { id: "11111111-1111-1111-1111-111111111111" },
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

