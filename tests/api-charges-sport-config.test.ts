import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";
const SPORT_CONFIG_ID = "22222222-2222-2222-2222-222222222222";
const TENANT_ID = "33333333-3333-3333-3333-333333333333";

type QueryResult = Record<string, unknown>[];

let selectQueue: QueryResult[] = [];
let selectCalls = 0;

function createSelectChain(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "offset"] as const;

  methods.forEach((method) => {
    chain[method] = vi.fn(() => chain);
  });

  Object.defineProperty(chain, "then", {
    value: (onFulfilled: unknown, onRejected?: unknown) =>
      Promise.resolve(result).then(onFulfilled as (value: QueryResult) => unknown, onRejected as () => unknown),
  });

  return chain;
}

async function importRoute() {
  return import("@/app/api/charges/route");
}

describe("API /api/charges sport config filtering", () => {
  beforeEach(() => {
    vi.resetModules();
    selectQueue = [];
    selectCalls = 0;

    vi.doMock("@/lib/authz", () => ({
      withTenant:
        (handler: (request: Request, context: unknown) => Promise<Response>) =>
        (request: Request, contextOverride?: Record<string, unknown>) =>
          handler(request, {
            tenantId: TENANT_ID,
            userId: "user-1",
            profile: {
              id: "profile-1",
              tenantId: TENANT_ID,
              role: "owner",
            },
            ...(contextOverride ?? {}),
          }),
    }));

    vi.doMock("@/lib/permissions", () => ({
      verifyAcademyAccess: vi.fn().mockResolvedValue({ allowed: true }),
    }));

    vi.doMock("@/lib/event-logging", () => ({
      logEvent: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock("@/db", () => ({
      db: {
        select: vi.fn(() => {
          selectCalls += 1;
          const result = selectQueue.shift();
          if (!result) throw new Error("Select queue exhausted");
          return createSelectChain(result);
        }),
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("filtra cargos por la configuración deportiva principal del atleta", async () => {
    selectQueue.push([{ athleteId: "athlete-1" }]);
    selectQueue.push([{ count: 1 }]);
    selectQueue.push([
      {
        id: "charge-1",
        academyId: ACADEMY_ID,
        athleteId: "athlete-1",
        athleteName: "Lucía Márquez",
        billingItemId: null,
        billingItemName: null,
        classId: null,
        label: "Cuota mensual",
        amountCents: 5000,
        currency: "EUR",
        period: "2026-06",
        dueDate: null,
        status: "pending",
        paymentMethod: null,
        paidAt: null,
        notes: null,
        createdAt: new Date("2026-06-01T00:00:00Z"),
        updatedAt: new Date("2026-06-01T00:00:00Z"),
        groupId: null,
        groupName: null,
      },
    ]);

    const { GET } = await importRoute();
    const response = await GET(
      new Request(
        `http://localhost/api/charges?academyId=${ACADEMY_ID}&period=2026-06&sportConfigId=${SPORT_CONFIG_ID}`
      ),
      {} as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        items: [{ id: "charge-1", athleteId: "athlete-1" }],
        total: 1,
      },
    });
  });

  it("devuelve vacío cuando la rama no tiene atletas", async () => {
    selectQueue.push([]);

    const { GET } = await importRoute();
    const response = await GET(
      new Request(
        `http://localhost/api/charges?academyId=${ACADEMY_ID}&period=2026-06&sportConfigId=${SPORT_CONFIG_ID}`
      ),
      {} as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        items: [],
        total: 0,
      },
    });
    expect(selectCalls).toBe(1);
  });
});
