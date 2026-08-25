import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-2222-2222-222222222222";
const ACADEMY_ID = "33333333-3333-3333-3333-333333333333";
const SCHOLARSHIP_ID = "44444444-4444-4444-4444-444444444444";
const DISCOUNT_ID = "55555555-5555-5555-5555-555555555555";
const CHARGE_ID = "66666666-6666-6666-6666-666666666666";
const ATHLETE_ID = "77777777-7777-7777-7777-777777777777";

const mocks = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  insertValues: [] as unknown[],
  updateSets: [] as unknown[],
  deleteCount: 0,
  scopeAllowed: true,
}));

function queryChain(result: unknown[] = []) {
  const query: Record<string, any> = {};
  for (const method of ["from", "where", "limit", "orderBy"]) {
    query[method] = vi.fn(() => query);
  }
  Object.defineProperty(query, "then", {
    value: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
    configurable: true,
  });
  return query;
}

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => queryChain(mocks.selectQueue.shift() ?? [])),
    insert: vi.fn(() => {
      const query = queryChain();
      query.values = vi.fn((values: unknown) => {
        mocks.insertValues.push(values);
        return query;
      });
      return query;
    }),
    update: vi.fn(() => {
      const query = queryChain();
      query.set = vi.fn((values: unknown) => {
        mocks.updateSets.push(values);
        return query;
      });
      return query;
    }),
    delete: vi.fn(() => {
      const query = queryChain();
      Object.defineProperty(query, "then", {
        value: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
          mocks.deleteCount += 1;
          return Promise.resolve([]).then(resolve, reject);
        },
      });
      return query;
    }),
  },
}));

vi.mock("@/lib/authz", () => ({
  withTenant: (handler: (request: Request, context: any) => Promise<Response>) =>
    (request: Request, context: any = {}) =>
      handler(request, {
        tenantId: TENANT_ID,
        userId: "88888888-8888-8888-8888-888888888888",
        profile: { id: "profile-1", userId: "user-1", role: "owner", tenantId: TENANT_ID },
        ...context,
      }),
}));

vi.mock("@/lib/authz/resource-scope", () => ({
  authorizeAcademyCapability: vi.fn(async () => ({ allowed: mocks.scopeAllowed })),
}));

function request(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function reset() {
  mocks.selectQueue = [];
  mocks.insertValues = [];
  mocks.updateSets = [];
  mocks.deleteCount = 0;
  mocks.scopeAllowed = true;
}

const scholarship = {
  tenantId: TENANT_ID,
  academyId: ACADEMY_ID,
  id: SCHOLARSHIP_ID,
  name: "Beca base",
};

const discount = {
  tenantId: TENANT_ID,
  academyId: ACADEMY_ID,
  id: DISCOUNT_ID,
  name: "Descuento primavera",
  code: "PRIMAVERA",
  discountType: "percentage",
  discountValue: "20",
  startDate: "2020-01-01",
  endDate: null,
  maxUses: null,
  currentUses: 0,
  minAmount: null,
  maxDiscount: null,
  isActive: true,
};

describe("ZAL-745: scholarships PUT/DELETE", () => {
  beforeEach(reset);

  it("actualiza una beca del tenant y devuelve éxito", async () => {
    mocks.selectQueue.push([scholarship]);
    const { PUT } = await import("@/app/api/scholarships/[scholarshipId]/route");
    const response = await PUT(
      request(`/api/scholarships/${SCHOLARSHIP_ID}`, "PUT", { name: "Beca renovada", isActive: false }),
      { params: { scholarshipId: SCHOLARSHIP_ID } },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateSets).toHaveLength(1);
    expect(mocks.updateSets[0]).toEqual(expect.objectContaining({ name: "Beca renovada", isActive: false }));
  });

  it("oculta una beca fuera de scope y no la muta", async () => {
    mocks.selectQueue.push([{ ...scholarship, tenantId: OTHER_TENANT_ID }]);
    mocks.scopeAllowed = false;
    const { PUT } = await import("@/app/api/scholarships/[scholarshipId]/route");
    const response = await PUT(
      request(`/api/scholarships/${SCHOLARSHIP_ID}`, "PUT", { name: "No debe cambiar" }),
      { params: { scholarshipId: SCHOLARSHIP_ID } },
    );

    expect(response.status).toBe(404);
    expect(mocks.updateSets).toHaveLength(0);
  });

  it("elimina una beca autorizada", async () => {
    mocks.selectQueue.push([scholarship]);
    const { DELETE } = await import("@/app/api/scholarships/[scholarshipId]/route");
    const response = await DELETE(
      request(`/api/scholarships/${SCHOLARSHIP_ID}`, "DELETE"),
      { params: { scholarshipId: SCHOLARSHIP_ID } },
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteCount).toBe(1);
  });

  it("rechaza eliminar una beca inexistente sin borrar", async () => {
    mocks.selectQueue.push([]);
    const { DELETE } = await import("@/app/api/scholarships/[scholarshipId]/route");
    const response = await DELETE(
      request(`/api/scholarships/${SCHOLARSHIP_ID}`, "DELETE"),
      { params: { scholarshipId: SCHOLARSHIP_ID } },
    );

    expect(response.status).toBe(404);
    expect(mocks.deleteCount).toBe(0);
  });
});

describe("ZAL-745: discounts apply/PUT/DELETE", () => {
  beforeEach(reset);

  it("aplica un descuento vigente, registra uso e incrementa el contador", async () => {
    mocks.selectQueue.push([discount], [{ id: CHARGE_ID }]);
    const { POST } = await import("@/app/api/discounts/apply/route");
    const response = await POST(request("/api/discounts/apply", "POST", {
      academyId: ACADEMY_ID,
      discountId: DISCOUNT_ID,
      chargeId: CHARGE_ID,
      athleteId: ATHLETE_ID,
      amount: 100,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { appliedDiscount: { discountAmount: 20, finalAmount: 80 } },
    });
    expect(mocks.insertValues).toHaveLength(1);
    expect(mocks.updateSets).toHaveLength(1);
  });

  it("rechaza aplicar un descuento si el cargo no pertenece al tenant y no muta", async () => {
    mocks.selectQueue.push([discount], []);
    const { POST } = await import("@/app/api/discounts/apply/route");
    const response = await POST(request("/api/discounts/apply", "POST", {
      academyId: ACADEMY_ID,
      discountId: DISCOUNT_ID,
      chargeId: CHARGE_ID,
      athleteId: ATHLETE_ID,
      amount: 100,
    }));

    expect(response.status).toBe(404);
    expect(mocks.insertValues).toHaveLength(0);
    expect(mocks.updateSets).toHaveLength(0);
  });

  it("actualiza un descuento autorizado", async () => {
    mocks.selectQueue.push([discount]);
    const { PUT } = await import("@/app/api/discounts/[discountId]/route");
    const response = await PUT(
      request(`/api/discounts/${DISCOUNT_ID}`, "PUT", { name: "Descuento nuevo", isActive: false }),
      { params: { discountId: DISCOUNT_ID } },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateSets).toHaveLength(1);
    expect(mocks.updateSets[0]).toEqual(expect.objectContaining({ name: "Descuento nuevo", isActive: false }));
  });

  it("rechaza actualizar un descuento sin capability y no muta", async () => {
    mocks.selectQueue.push([discount]);
    mocks.scopeAllowed = false;
    const { PUT } = await import("@/app/api/discounts/[discountId]/route");
    const response = await PUT(
      request(`/api/discounts/${DISCOUNT_ID}`, "PUT", { name: "No debe cambiar" }),
      { params: { discountId: DISCOUNT_ID } },
    );

    expect(response.status).toBe(404);
    expect(mocks.updateSets).toHaveLength(0);
  });

  it("elimina un descuento autorizado", async () => {
    mocks.selectQueue.push([discount]);
    const { DELETE } = await import("@/app/api/discounts/[discountId]/route");
    const response = await DELETE(
      request(`/api/discounts/${DISCOUNT_ID}`, "DELETE"),
      { params: { discountId: DISCOUNT_ID } },
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteCount).toBe(1);
  });

  it("rechaza eliminar un descuento fuera de scope sin borrar", async () => {
    mocks.selectQueue.push([{ ...discount, tenantId: OTHER_TENANT_ID }]);
    mocks.scopeAllowed = false;
    const { DELETE } = await import("@/app/api/discounts/[discountId]/route");
    const response = await DELETE(
      request(`/api/discounts/${DISCOUNT_ID}`, "DELETE"),
      { params: { discountId: DISCOUNT_ID } },
    );

    expect(response.status).toBe(404);
    expect(mocks.deleteCount).toBe(0);
  });
});
