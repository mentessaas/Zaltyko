import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Types for mock responses
type MockResponse = {
  items: Record<string, unknown>[];
};

// Module-level state for mocks
let mockSelectQueue: MockResponse[] = [];
let mockInsertCalls: Array<{ table: unknown; payload: unknown }> = [];
let mockDeleteCalls: unknown[] = [];
let mockUpdateCalls: unknown[] = [];

const assertWithinPlanLimitsMock = vi.fn().mockResolvedValue(undefined);
const syncChargesMock = vi.fn().mockResolvedValue(undefined);

// Create a thenable query object that mimics drizzle-orm behavior
const createQueryObject = (response: MockResponse) => {
  let isLimited = false;
  let limitValue = 1;

  const chain: Record<string, unknown> = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    rightJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn((n: number) => {
      isLimited = true;
      limitValue = n;
      return chain;
    }),
    offset: vi.fn(() => chain),
  };

  // Make it thenable (like drizzle query objects)
  // When awaited, it returns the items (or sliced items if limited to 1)
  const thenableFn = (onFulfilled: unknown, onRejected?: unknown) => {
    let items = response.items;
    if (isLimited && limitValue === 1) {
      items = items.slice(0, 1);
    }
    return Promise.resolve(items).then(onFulfilled, onRejected);
  };

  return Object.assign(chain, { then: thenableFn });
};

const originalEnv = { ...process.env };

describe("API /api/athletes", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };

    // Reset mock state
    mockInsertCalls = [];
    mockSelectQueue = [];
    mockDeleteCalls = [];
    mockUpdateCalls = [];

    vi.mock("@/lib/authz", () => ({
      withTenant:
        (handler: (request: Request, context: unknown) => Promise<Response>) =>
        (_request: Request, contextOverride?: unknown) =>
          handler(_request, {
            tenantId: "tenant-123",
            userId: "user-456",
            profile: {
              id: "profile-1",
              tenantId: "tenant-123",
              role: "owner",
            },
            params: (contextOverride as { params?: Record<string, string> })?.params ?? {},
          }),
    }));

    vi.mock("@/lib/limits", () => ({
      assertWithinPlanLimits: assertWithinPlanLimitsMock,
    }));

    vi.mock("@/lib/billing/sync-charges", () => ({
      syncChargesForAthleteCurrentPeriod: syncChargesMock,
    }));

    vi.mock("@/lib/permissions", () => ({
      verifyAcademyAccess: vi.fn().mockResolvedValue({ allowed: true }),
      verifyGroupAccess: vi.fn().mockResolvedValue({ allowed: true }),
    }));

    vi.mock("@/db", () => ({
      db: {
        insert: vi.fn((table: unknown) => ({
          values: (payload: unknown) => {
            mockInsertCalls.push({ table, payload });
            return {
              onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
              returning: vi.fn(() => Promise.resolve({})),
            };
          },
        })),
        select: vi.fn(() => {
          const response = mockSelectQueue.shift() ?? { items: [] };
          return createQueryObject(response);
        }),
        update: vi.fn(() => ({
          set: vi.fn((data: unknown) => {
            mockUpdateCalls.push(data);
            return {
              where: vi.fn().mockResolvedValue(undefined),
              returning: vi.fn(() => Promise.resolve([{}])),
            };
          }),
        })),
        delete: vi.fn(() => ({
          where: vi.fn((condition: unknown) => {
            mockDeleteCalls.push(condition);
            return Promise.resolve(undefined);
          }),
        })),
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  describe("POST /api/athletes", () => {
    it("crea un atleta con contacto familiar", async () => {
      const { POST } = await import("@/app/api/athletes/route");

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

      const response = await POST(request, {} as unknown as Record<string, unknown>);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(assertWithinPlanLimitsMock).toHaveBeenCalledWith(
        "tenant-123",
        "11111111-1111-1111-1111-111111111111",
        "athletes"
      );

      const athleteInsert = mockInsertCalls[0];
      expect(athleteInsert?.payload).toMatchObject({
        academyId: "11111111-1111-1111-1111-111111111111",
        name: "Lucía Márquez",
        level: "FIG 5",
        status: "active",
      });

      const familyInsert = mockInsertCalls[1];
      expect(Array.isArray(familyInsert?.payload)).toBe(true);
    });
  });

  describe("GET /api/athletes", () => {
    it("devuelve listado filtrado de atletas", async () => {
      const { GET } = await import("@/app/api/athletes/route");

      // Setup: first call for count query, second for data query
      mockSelectQueue = [
        { items: [{ id: "athlete-1" }] }, // count query
        {
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
        }, // data query
      ];

      const request = new Request(
        "http://localhost/api/athletes?status=active&academyId=11111111-1111-1111-1111-111111111111",
        {
          method: "GET",
        }
      );

      const response = await GET(request, {} as unknown as Record<string, unknown>);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        id: "athlete-1",
        name: "Lucía Márquez",
        status: "active",
      });
    });
  });

  describe("PATCH /api/athletes/:id", () => {
    it("actualiza datos básicos del atleta", async () => {
      const { PATCH } = await import("@/app/api/athletes/[athleteId]/route");

      // Setup: one select for getAthleteTenant
      mockSelectQueue = [
        {
          items: [{ id: "athlete-1", tenantId: "tenant-123", academyId: "academy-1" }],
        },
      ];

      const request = new Request("http://localhost/api/athletes/athlete-1", {
        method: "PATCH",
        body: JSON.stringify({
          name: "Lucía Actualizada",
          status: "inactive",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await PATCH(request, {
        params: { athleteId: "athlete-1" },
      } as unknown as Record<string, unknown>);

      expect(response.status).toBe(200);
    });
  });

  describe("DELETE /api/athletes/:id", () => {
    it("elimina un atleta existente", async () => {
      const { DELETE } = await import("@/app/api/athletes/[athleteId]/route");

      // Setup: one select for getAthleteTenant
      mockSelectQueue = [
        {
          items: [{ id: "athlete-1", tenantId: "tenant-123", academyId: "academy-1" }],
        },
      ];

      const request = new Request("http://localhost/api/athletes/athlete-1", {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: { athleteId: "athlete-1" },
      } as unknown as Record<string, unknown>);

      expect(response.status).toBe(200);
    });
  });
});
