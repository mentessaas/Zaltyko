import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";
const SPORT_CONFIG_ID = "22222222-2222-2222-2222-222222222222";
const TENANT_ID = "33333333-3333-3333-3333-333333333333";

type QueryResult = Record<string, unknown>[];

let selectQueue: QueryResult[] = [];
let selectCalls = 0;

function createSelectChain(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"] as const;

  methods.forEach((method) => {
    chain[method] = vi.fn(() => chain);
  });

  Object.defineProperty(chain, "then", {
    value: (onFulfilled: unknown, onRejected?: unknown) =>
      Promise.resolve(result).then(onFulfilled as (value: QueryResult) => unknown, onRejected as () => unknown),
  });

  return chain;
}

function mockCommonModules() {
  vi.doMock("@/lib/authz", () => ({
    withTenant:
      (handler: (request: Request, context: unknown) => Promise<Response>) =>
      (request: Request) =>
        handler(request, {
          tenantId: TENANT_ID,
          userId: "user-1",
          profile: {
            id: "profile-1",
            tenantId: TENANT_ID,
            role: "owner",
          },
        }),
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
}

describe("billing sport config filters", () => {
  beforeEach(() => {
    vi.resetModules();
    selectQueue = [];
    selectCalls = 0;
    mockCommonModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("filtra becas por la rama principal del deportista", async () => {
    selectQueue.push([
      {
        id: "scholarship-1",
        athleteId: "athlete-1",
        athleteName: "Lucía Márquez",
        name: "Beca rendimiento",
        description: null,
        discountType: "percentage",
        discountValue: "25",
        startDate: "2026-06-01",
        endDate: null,
        autoRenew: false,
        requiredDocuments: null,
        isActive: true,
      },
    ]);

    const { GET } = await import("@/app/api/scholarships/route");
    const response = await GET(
      new Request(
        `http://localhost/api/scholarships?academyId=${ACADEMY_ID}&sportConfigId=${SPORT_CONFIG_ID}`
      ),
      {} as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        items: [
          {
            id: "scholarship-1",
            athleteId: "athlete-1",
            discountValue: 25,
          },
        ],
      },
    });
  });

  it("devuelve historial de descuentos vacío cuando la rama no tiene deportistas", async () => {
    selectQueue.push([]);

    const { GET } = await import("@/app/api/discounts/usage/route");
    const response = await GET(
      new Request(
        `http://localhost/api/discounts/usage?academyId=${ACADEMY_ID}&sportConfigId=${SPORT_CONFIG_ID}`
      ),
      {} as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        items: [],
        summary: {
          totalUsage: 0,
          totalDiscount: 0,
        },
      },
    });
    expect(selectCalls).toBe(1);
  });
});
