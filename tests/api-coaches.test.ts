import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { coaches, memberships } from "@/db/schema";

let POST: typeof import("@/app/api/coaches/route").POST;
let GET: typeof import("@/app/api/coaches/route").GET;
let PATCH: typeof import("@/app/api/coaches/[coachId]/route").PATCH;
let DELETE: typeof import("@/app/api/coaches/[coachId]/route").DELETE;

let insertCalls: Array<{ table: unknown; payload: unknown }> = [];
let currentParams: Record<string, string> = {};

type SelectChainConfig =
  | { resolveAt: "orderBy"; result: any[] }
  | { resolveAt: "where"; result: any[] }
  | { resolveAt: "limit"; result: any[] };

const createSelectChain = ({ resolveAt, result }: SelectChainConfig) => {
  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
  };

  if (resolveAt === "orderBy") {
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => Promise.resolve(result));
  } else if (resolveAt === "where") {
    chain.where = vi.fn(() => Promise.resolve(result));
    chain.orderBy = vi.fn();
  } else if (resolveAt === "limit") {
    chain.where = vi.fn(() => ({
      limit: vi.fn(() => Promise.resolve(result)),
    }));
    chain.orderBy = vi.fn();
  }

  return chain;
};

const originalEnv = { ...process.env };
let selectQueue: any[] = [];

describe("API /api/coaches", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };
    selectQueue = [];
    insertCalls = [];
    currentParams = {};

    vi.mock("@/lib/authz", () => ({
      withTenant:
        (handler: (request: Request, context: any) => Promise<Response>) =>
        (request: Request, contextOverride?: any) =>
          handler(request, {
            tenantId: "tenant-123",
            userId: "user-456",
            profile: {
              id: "profile-1",
              tenantId: "tenant-123",
              role: "admin",
            },
            params: contextOverride?.params ?? currentParams,
          }),
    }));

    vi.mock("@/db", () => ({
      db: {
        insert: vi.fn((table) => {
          return {
            values: (payload: unknown) => {
              insertCalls.push({ table, payload });
              return {
                onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
              };
            },
          };
        }),
        select: vi.fn(() => {
          const chain = selectQueue.shift();
          if (!chain) {
            throw new Error("Select queue exhausted");
          }
          return chain;
        }),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(undefined),
          })),
        })),
        delete: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      },
    }));

    const coachesModule = await import("@/app/api/coaches/route");
    POST = coachesModule.POST;
    GET = coachesModule.GET;

    const coachDetailModule = await import("@/app/api/coaches/[coachId]/route");
    PATCH = coachDetailModule.PATCH;
    DELETE = coachDetailModule.DELETE;
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("crea un coach y crea membresía si existe perfil", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "limit",
        result: [{ id: "22222222-2222-2222-2222-222222222222", userId: "user-789" }],
      })
    );

    const request = new Request("http://localhost/api/coaches", {
      method: "POST",
      body: JSON.stringify({
        academyId: "11111111-1111-1111-1111-111111111111",
        name: "Laura Sánchez",
        email: "laura@example.com",
        profileId: "22222222-2222-2222-2222-222222222222",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, {} as any);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toHaveProperty("id");

    const coachInsert = insertCalls[0];
    expect(coachInsert?.payload).toMatchObject({
      academyId: "11111111-1111-1111-1111-111111111111",
      name: "Laura Sánchez",
      email: "laura@example.com",
      tenantId: "tenant-123",
    });

    const membershipInsert = insertCalls[1];
    expect(membershipInsert?.payload).toMatchObject({
      academyId: "11111111-1111-1111-1111-111111111111",
      role: "coach",
      userId: "user-789",
    });
  });

  it("lista coaches con clases asignadas", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "orderBy",
        result: [
          {
            id: "coach-1",
            name: "Luis Romero",
            email: "coach@example.com",
            phone: "+34 600 000 001",
            academyId: "11111111-1111-1111-1111-111111111111",
            academyName: "Gymna Training Center",
            createdAt: new Date().toISOString(),
          },
        ],
      })
    );

    selectQueue.push(
      createSelectChain({
        resolveAt: "where",
        result: [
          {
            coachId: "coach-1",
            classId: "class-1",
            className: "Equipo FIG Avanzado",
            classAcademyId: "11111111-1111-1111-1111-111111111111",
          },
        ],
      })
    );

    const request = new Request(
      "http://localhost/api/coaches?includeAssignments=true&academyId=11111111-1111-1111-1111-111111111111",
      {
        method: "GET",
      }
    );

    const response = await GET(request, {} as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: "coach-1",
      classes: [
        {
          id: "class-1",
          name: "Equipo FIG Avanzado",
        },
      ],
    });
  });

  it("actualiza datos de un coach", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "limit",
        result: [{ id: "coach-1", tenantId: "tenant-123" }],
      })
    );

    const request = new Request("http://localhost/api/coaches/coach-1", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Laura Actualizada",
        phone: "+34 699 111 222",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, { params: { coachId: "coach-1" } } as any);
    expect(response.status).toBe(200);
  });

  it("elimina un coach existente", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "limit",
        result: [{ id: "coach-1", tenantId: "tenant-123" }],
      })
    );

    const request = new Request("http://localhost/api/coaches/coach-1", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: { coachId: "coach-1" } } as any);
    expect(response.status).toBe(200);
  });
});


