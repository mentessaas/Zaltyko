import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const CHARGE_ID = "44444444-4444-4444-4444-444444444444";

type QueryResult = Record<string, unknown>[];

let selectQueue: QueryResult[] = [];
let deleteCalls = 0;

function createSelectChain(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "offset"].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  Object.defineProperty(chain, "then", {
    value: (onFulfilled: unknown, onRejected?: unknown) =>
      Promise.resolve(result).then(onFulfilled as (v: QueryResult) => unknown, onRejected as () => unknown),
  });
  return chain;
}

async function importRoute() {
  return import("@/app/api/charges/[chargeId]/route");
}

function makeRequest() {
  return new Request(`http://localhost/api/charges/${CHARGE_ID}`, { method: "DELETE" });
}

/** Cargo base sin cobrar: borrable. */
function charge(overrides: Record<string, unknown> = {}) {
  return {
    id: CHARGE_ID,
    tenantId: TENANT_ID,
    academyId: ACADEMY_ID,
    status: "pending",
    stripeChargeId: null,
    stripePaymentIntentId: null,
    ...overrides,
  };
}

describe("DELETE /api/charges/[chargeId] · protección de cargos cobrados", () => {
  beforeEach(() => {
    vi.resetModules();
    selectQueue = [];
    deleteCalls = 0;

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

    vi.doMock("@/db", () => ({
      db: {
        select: vi.fn(() => {
          const result = selectQueue.shift();
          if (!result) throw new Error("Select queue exhausted");
          return createSelectChain(result);
        }),
        delete: vi.fn(() => ({
          where: vi.fn(() => {
            deleteCalls += 1;
            return Promise.resolve();
          }),
        })),
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("elimina un cargo pendiente que nunca se cobró", async () => {
    selectQueue.push([charge({ status: "pending" })]);

    const { DELETE } = await importRoute();
    const response = await DELETE(makeRequest(), {} as never);

    expect(response.status).toBe(200);
    expect(deleteCalls).toBe(1);
  });

  // Un cargo cobrado es un registro contable: borrarlo destruiría la trazabilidad.
  it.each(["paid", "partial", "refunded"])(
    "rechaza eliminar un cargo en estado %s y no toca la base de datos",
    async (status) => {
      selectQueue.push([charge({ status })]);

      const { DELETE } = await importRoute();
      const response = await DELETE(makeRequest(), {} as never);

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ error: "CHARGE_NOT_DELETABLE" });
      expect(deleteCalls).toBe(0);
    }
  );

  it("rechaza eliminar un cargo vinculado a un pago de Stripe aunque figure como pendiente", async () => {
    selectQueue.push([charge({ status: "pending", stripePaymentIntentId: "pi_123" })]);

    const { DELETE } = await importRoute();
    const response = await DELETE(makeRequest(), {} as never);

    expect(response.status).toBe(409);
    expect(deleteCalls).toBe(0);
  });
});
