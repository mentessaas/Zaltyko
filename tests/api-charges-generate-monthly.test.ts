import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const GROUP_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GROUP_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ATHLETE = "cccccccc-cccc-cccc-cccc-cccccccccccc";

type QueryResult = Record<string, unknown>[];

let selectQueue: QueryResult[] = [];
let insertedCharges: Record<string, unknown>[][] = [];

function createSelectChain(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "offset"].forEach((method) => {
    chain[method] = vi.fn(() => chain);
  });
  Object.defineProperty(chain, "then", {
    value: (onFulfilled: unknown, onRejected?: unknown) =>
      Promise.resolve(result).then(onFulfilled as (value: QueryResult) => unknown, onRejected as () => unknown),
  });
  return chain;
}

async function importRoute() {
  return import("@/app/api/charges/generate-monthly/route");
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/charges/generate-monthly", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/charges/generate-monthly (multi-grupo)", () => {
  beforeEach(() => {
    vi.resetModules();
    selectQueue = [];
    insertedCharges = [];

    vi.doMock("@/lib/authz", () => ({
      withTenant:
        (handler: (request: Request, context: unknown) => Promise<Response>) =>
        (request: Request, contextOverride?: Record<string, unknown>) =>
          handler(request, {
            tenantId: TENANT_ID,
            userId: "user-1",
            profile: { id: "profile-1", tenantId: TENANT_ID, role: "owner" },
            ...(contextOverride ?? {}),
          }),
    }));

    vi.doMock("@/lib/permissions", () => ({
      verifyAcademyAccess: vi.fn().mockResolvedValue({ allowed: true }),
      verifyGroupAccess: vi.fn().mockResolvedValue({ allowed: true }),
    }));

    vi.doMock("@/db", () => ({
      db: {
        select: vi.fn(() => {
          const result = selectQueue.shift();
          if (!result) throw new Error("Select queue exhausted");
          return createSelectChain(result);
        }),
        insert: vi.fn(() => ({
          values: vi.fn((rows: Record<string, unknown>[]) => {
            insertedCharges.push(rows);
            return Promise.resolve();
          }),
        })),
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("genera un cargo por cada grupo del atleta con su propia cuota", async () => {
    // 1. grupos de la academia (cuota base)
    selectQueue.push([
      { id: GROUP_A, name: "Competición A", monthlyFeeCents: 5000 },
      { id: GROUP_B, name: "Competición B", monthlyFeeCents: 8000 },
    ]);
    // 2. pertenencias vía group_athletes (B con override 6000)
    selectQueue.push([
      { athleteId: ATHLETE, groupId: GROUP_A, customFeeCents: null },
      { athleteId: ATHLETE, groupId: GROUP_B, customFeeCents: 6000 },
    ]);
    // 3. fallback legacy (mismo A → deduplicado, no duplica)
    selectQueue.push([{ athleteId: ATHLETE, groupId: GROUP_A }]);
    // 4-5. checks de cargo existente por grupo (ninguno existe)
    selectQueue.push([]);
    selectQueue.push([]);

    const { POST } = await importRoute();
    const response = await POST(makeRequest({ academyId: ACADEMY_ID, period: "2026-07" }), {} as never);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ data: { created: 2 } });

    expect(insertedCharges).toHaveLength(1);
    const charges = insertedCharges[0];
    expect(charges).toHaveLength(2);

    const byGroup = new Map(charges.map((c) => [c.groupId, c]));
    expect(byGroup.get(GROUP_A)).toMatchObject({ amountCents: 5000, athleteId: ATHLETE, groupId: GROUP_A });
    expect(byGroup.get(GROUP_B)).toMatchObject({ amountCents: 6000, athleteId: ATHLETE, groupId: GROUP_B });
  });

  it("omite el grupo que ya tiene cargo en el periodo y cobra solo el otro", async () => {
    selectQueue.push([
      { id: GROUP_A, name: "Competición A", monthlyFeeCents: 5000 },
      { id: GROUP_B, name: "Competición B", monthlyFeeCents: 8000 },
    ]);
    selectQueue.push([
      { athleteId: ATHLETE, groupId: GROUP_A, customFeeCents: null },
      { athleteId: ATHLETE, groupId: GROUP_B, customFeeCents: null },
    ]);
    selectQueue.push([]); // sin legacy
    selectQueue.push([{ id: "existing-charge" }]); // A ya tiene cargo
    selectQueue.push([]); // B no

    const { POST } = await importRoute();
    const response = await POST(makeRequest({ academyId: ACADEMY_ID, period: "2026-07" }), {} as never);

    expect(response.status).toBe(201);
    expect(insertedCharges).toHaveLength(1);
    const charges = insertedCharges[0];
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ groupId: GROUP_B, amountCents: 8000 });
  });
});
