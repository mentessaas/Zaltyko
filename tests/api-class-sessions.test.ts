import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { classSessions } from "@/db/schema";

let POST: typeof import("@/app/api/class-sessions/route").POST;
let GET: typeof import("@/app/api/class-sessions/route").GET;
let PUT_SESSION: typeof import("@/app/api/class-sessions/[sessionId]/route").PUT;

let insertCalls: Array<{ table: unknown; payload: unknown }> = [];

type SelectChainConfig =
  | { resolveAt: "limit"; result: any[] }
  | { resolveAt: "orderBy"; result: any[] };

const createSelectChain = ({ resolveAt, result }: SelectChainConfig) => {
  if (resolveAt === "limit") {
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(result)),
        })),
      })),
    };
  }

  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
};

const originalEnv = { ...process.env };
let selectQueue: any[] = [];

describe("API /api/class-sessions", () => {
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
              onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
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
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve()),
          })),
        })),
      },
    }));

    const mainModule = await import("@/app/api/class-sessions/route");
    POST = mainModule.POST;
    GET = mainModule.GET;

    const sessionModule = await import("@/app/api/class-sessions/[sessionId]/route");
    PUT_SESSION = sessionModule.PUT;
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("crea una sesión de clase", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "limit",
        result: [{ id: "22222222-2222-2222-2222-222222222222" }],
      })
    );

    const request = new Request("http://localhost/api/class-sessions", {
      method: "POST",
      body: JSON.stringify({
        academyId: "11111111-1111-1111-1111-111111111111",
        classId: "22222222-2222-2222-2222-222222222222",
        sessionDate: "2025-05-12",
        startTime: "17:00",
        endTime: "19:00",
        coachId: "33333333-3333-3333-3333-333333333333",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, {} as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("id");
    const sessionInsert = insertCalls[0];
    expect(sessionInsert?.payload).toMatchObject({
      classId: "22222222-2222-2222-2222-222222222222",
      sessionDate: "2025-05-12",
      startTime: "17:00",
      endTime: "19:00",
    });
  });

  it("lista sesiones en rango semanal", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "orderBy",
        result: [
          {
            id: "session-1",
            date: "2025-05-12",
            startTime: "17:00",
            endTime: "19:00",
            status: "scheduled",
            classId: "22222222-2222-2222-2222-222222222222",
            className: "Equipo FIG Avanzado",
            academyId: "11111111-1111-1111-1111-111111111111",
            academyName: "Gymna Training Center",
            coachId: "33333333-3333-3333-3333-333333333333",
            coachName: "Luis Romero",
          },
        ],
      })
    );

    const request = new Request(
      "http://localhost/api/class-sessions?from=2025-05-10&to=2025-05-17",
      { method: "GET" }
    );

    const response = await GET(request, {} as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: "session-1",
      className: "Equipo FIG Avanzado",
      coachName: "Luis Romero",
    });
  });

  it("actualiza una sesión existente", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "limit",
        result: [{ id: "session-1", classId: "class-123" }],
      })
    );

    const request = new Request("http://localhost/api/class-sessions/session-1", {
      method: "PUT",
      body: JSON.stringify({
        sessionDate: "2025-05-13",
        status: "completed",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PUT_SESSION(request as any, { params: { sessionId: "session-1" } });
    expect(response.status).toBe(200);
  });
});

