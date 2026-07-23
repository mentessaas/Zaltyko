import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let POST: typeof import("@/app/api/academies/route").POST;
let GET: typeof import("@/app/api/academies/route").GET;

const originalEnv = { ...process.env };

let selectQueue: any[] = [];
let insertCalls: Array<{ table: unknown; payload: any }> = [];
let updateCalls: Array<{ table: unknown; values: unknown }> = [];
let currentProfileRole: string;

const createSelectChain = (config: { resolveAt: "limit" | "orderBy"; result: any[] }) => {
  const chain: Record<string, any> = {};

  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);

  if (config.resolveAt === "limit") {
    chain.limit = vi.fn(() => Promise.resolve(config.result));
  } else {
    chain.orderBy = vi.fn(() => Promise.resolve(config.result));
  }

  return chain;
};

vi.mock("@/lib/authz", () => ({
  withTenant:
    (handler: (request: Request, context: any) => Promise<Response>) =>
    (request: Request, ctx: any = {}) =>
      handler(request, {
        tenantId: "tenant-123",
        userId: "user-123",
        profile: {
          id: "profile-1",
          userId: "user-123",
          role: currentProfileRole,
          tenantId: "tenant-123",
        },
        ...ctx,
      }),
}));

vi.mock("@/lib/limits", () => ({
  assertUserAcademyLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/sport-config/seed", () => ({
  activateAcademySportConfig: vi.fn().mockResolvedValue({
    configVersion: "test-v1",
    isGenericFallback: false,
  }),
}));

vi.mock("@/lib/onboarding", () => ({
  seedOnboardingForAcademy: vi.fn().mockResolvedValue(undefined),
  markWizardStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/event-logging", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn((table) => ({
      values: (payload: unknown) => {
        insertCalls.push({ table, payload });
        return {
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
          onConflictDoUpdate: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
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
    update: vi.fn((table) => ({
      set: (values: unknown) => {
        updateCalls.push({ table, values });
        return {
          where: vi.fn(() => Promise.resolve()),
        };
      },
    })),
  },
}));

describe("API /api/academies", () => {
  beforeAll(async () => {
    const academiesModule = await import("@/app/api/academies/route");
    POST = academiesModule.POST;
    GET = academiesModule.GET;
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    selectQueue = [];
    insertCalls = [];
    updateCalls = [];
    currentProfileRole = "owner";
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("crea una academia con su tipo", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "limit",
        result: [{ id: "plan-free-id" }],
      })
    );

    const request = new Request("http://localhost/api/academies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Academia Aurora",
        country: "ES",
        region: "Madrid",
        academyType: "artistica",
      }),
    });

    const response = await POST(request, {} as any);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toMatchObject({
      tenantId: "tenant-123",
      academyType: "artistica",
    });
    const academyInsert = insertCalls[0];
    expect(academyInsert?.payload).toMatchObject({
      academyType: "artistica",
    });
  });

  it("bloquea si el perfil no es owner/admin", async () => {
    const request = new Request("http://localhost/api/academies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Academia Aurora",
        academyType: "artistica",
      }),
    });

    currentProfileRole = "coach";

    const response = await POST(request, {} as any);

    expect(response.status).toBe(403);
    expect(insertCalls.length).toBe(0);
  });

  it("lista academias filtrando por tipo", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "orderBy",
        result: [
          {
            id: "academy-1",
            name: "Academia Aurora",
            academyType: "artistica",
            tenantId: "tenant-123",
          },
        ],
      })
    );

    const request = new Request("http://localhost/api/academies?academyType=artistica");
    const response = await GET(request, {} as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items).toEqual([
      {
        id: "academy-1",
        name: "Academia Aurora",
        academyType: "artistica",
        tenantId: "tenant-123",
      },
    ]);
  });
});
