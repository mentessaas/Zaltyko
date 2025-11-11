import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { athletes } from "@/db/schema";

let POST: typeof import("@/app/api/athletes/route").POST;
let GET: typeof import("@/app/api/athletes/route").GET;
let PATCH: typeof import("@/app/api/athletes/[athleteId]/route").PATCH;
let DELETE: typeof import("@/app/api/athletes/[athleteId]/route").DELETE;

let currentParams: Record<string, string> = {};

const assertWithinPlanLimitsMock = vi.fn().mockResolvedValue(undefined);

type SelectResponse = {
  items: Record<string, unknown>[];
};

let selectQueue: SelectResponse[] = [];

const selectChainFactory = () => {
  const response = selectQueue.shift() ?? { items: [] };
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
    orderBy: vi.fn(() => Promise.resolve(response.items)),
    limit: vi.fn(() => Promise.resolve(response.items)),
  };
  return chain;
};

let selectChain: any;
let insertCalls: Array<{ table: unknown; payload: unknown }> = [];

const originalEnv = { ...process.env };

describe("API /api/athletes", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };
    insertCalls = [];
    selectQueue = [];
    currentParams = {};
    selectChain = selectChainFactory();

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
              role: "owner",
            },
            params: contextOverride?.params ?? currentParams,
          }),
    }));

    vi.mock("@/lib/limits", () => ({
      assertWithinPlanLimits: assertWithinPlanLimitsMock,
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
          selectChain = selectChainFactory();
          return selectChain;
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

    const athletesModule = await import("@/app/api/athletes/route");
    POST = athletesModule.POST;
    GET = athletesModule.GET;

    const athletesDetailModule = await import("@/app/api/athletes/[athleteId]/route");
    PATCH = athletesDetailModule.PATCH;
    DELETE = athletesDetailModule.DELETE;
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("crea un atleta con contacto familiar", async () => {
    const payload = {
      academyId: "11111111-1111-1111-1111-111111111111",
      name: "Lucía Márquez",
      level: "FIG 5",
      status: "active",
      dob: "2010-05-14",
      contacts: [
        {
          name: "Ana López",
          email: "ana@example.com",
        },
      ],
    };

    const request = new Request("http://localhost/api/athletes", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, {} as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(assertWithinPlanLimitsMock).toHaveBeenCalledWith(
      "tenant-123",
      "11111111-1111-1111-1111-111111111111",
      "athletes"
    );

    const athleteInsert = insertCalls[0];
    expect(athleteInsert?.payload).toMatchObject({
      academyId: "11111111-1111-1111-1111-111111111111",
      name: "Lucía Márquez",
      level: "FIG 5",
      status: "active",
    });

    const familyInsert = insertCalls[1];
    expect(Array.isArray(familyInsert?.payload)).toBe(true);
  });

  it("devuelve listado filtrado de atletas", async () => {
    selectQueue.push({
      items: [
        {
          id: "athlete-1",
          name: "Lucía Márquez",
          level: "FIG 5",
          status: "active",
          dob: "2010-05-14",
          academyId: "11111111-1111-1111-1111-111111111111",
          academyName: "Gymna Training Center",
          age: 14,
          guardianCount: 2,
        },
      ],
    });

    const request = new Request(
      "http://localhost/api/athletes?status=active&academyId=11111111-1111-1111-1111-111111111111",
      {
        method: "GET",
      }
    );

    const response = await GET(request, {} as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: "athlete-1",
      name: "Lucía Márquez",
      status: "active",
    });
  });

  it("actualiza datos básicos del atleta", async () => {
    selectQueue.push({
      items: [{ id: "athlete-1", tenantId: "tenant-123" }],
    });

    const request = new Request("http://localhost/api/athletes/athlete-1", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Lucía Actualizada",
        status: "inactive",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, { params: { athleteId: "athlete-1" } } as any);
    expect(response.status).toBe(200);
  });

  it("elimina un atleta existente", async () => {
    selectQueue.push({
      items: [{ id: "athlete-1", tenantId: "tenant-123" }],
    });

    const request = new Request("http://localhost/api/athletes/athlete-1", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: { athleteId: "athlete-1" } } as any);
    expect(response.status).toBe(200);
  });
});

