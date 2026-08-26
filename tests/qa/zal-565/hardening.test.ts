import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const ACADEMY_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_ACADEMY_ID = "33333333-3333-3333-3333-333333333333";
const EVENT_ID = "77777777-7777-7777-7777-777777777777";
const LISTING_ID = "44444444-4444-4444-4444-444444444444";
const CHARGE_ID = "55555555-5555-5555-5555-555555555555";

let selectQueue: unknown[][] = [];
let updateResult: unknown[] = [];
let updateCalls: unknown[] = [];
let deleteCalls: unknown[] = [];
let academyAccess = { allowed: true };
let capabilityAccess = { allowed: true };
let activeRole = "admin";

function chain(result: unknown[], onWhere?: (condition: unknown, rows: unknown[]) => unknown[]) {
  let effectiveResult = result;
  const query: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "limit", "orderBy", "offset"]) {
    query[method] = vi.fn(() => query);
  }
  query.where = vi.fn((condition: unknown) => {
    effectiveResult = onWhere?.(condition, effectiveResult) ?? effectiveResult;
    return query;
  });
  Object.defineProperty(query, "then", {
    value: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(effectiveResult).then(resolve, reject),
  });
  return query;
}

function request(path: string, method: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function containsTenantColumn(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const candidate = value as { name?: unknown; _name?: unknown; [key: string]: unknown };
  if (candidate.name === "tenant_id" || candidate._name === "tenant_id") return true;
  return Object.values(candidate).some((child) => containsTenantColumn(child, seen));
}

function mockTenant(role = "admin") {
  activeRole = role;
  vi.mock("@/lib/authz", () => ({
    withTenant: (handler: (request: Request, context: any) => Promise<Response>) =>
      (request: Request, context: any = {}) => handler(request, {
        tenantId: TENANT_ID,
        userId: "66666666-6666-6666-6666-666666666666",
        profile: { id: "profile-1", userId: "user-1", role: activeRole, tenantId: TENANT_ID },
        ...context,
      }),
  }));
}

function mockDb() {
  vi.mock("@/db", () => ({
    db: {
      select: vi.fn(() => {
        const result = selectQueue.shift();
        if (!result) throw new Error("Select queue exhausted");
        return chain(result, (condition, rows) => {
          if (!rows.some((row) => row && typeof row === "object" && Object.prototype.hasOwnProperty.call(row, "contactEmail"))) {
            return rows;
          }
          if (!containsTenantColumn(condition)) return rows;
          return rows.filter((row) => (row as { tenantId?: string }).tenantId === TENANT_ID);
        });
      }),
      update: vi.fn(() => ({
        set: vi.fn((payload: unknown) => ({
          where: vi.fn(() => ({ returning: vi.fn(async () => { updateCalls.push(payload); return updateResult; }) })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn(async () => { deleteCalls.push(true); return []; }) })),
      })),
    },
  }));
}

describe("ZAL-957: empleo", () => {
  beforeEach(() => {
    vi.resetModules();
    selectQueue = [];
    updateCalls = [];
    deleteCalls = [];
    academyAccess = { allowed: true };
    mockTenant("owner");
    mockDb();
    vi.mock("@/lib/permissions", () => ({
      verifyAcademyAccess: vi.fn(async () => academyAccess),
    }));
  });

  it("rechaza unknown keys antes de consultar o mutar", async () => {
    const { PATCH } = await import("@/app/api/empleo/[id]/route");
    const response = await PATCH(request(`/api/empleo/${LISTING_ID}`, "PATCH", { title: "Oferta válida", isFeatured: true }), { params: { id: LISTING_ID } } as never);
    expect(response.status).toBe(400);
    expect(selectQueue).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("rechaza tipos inválidos antes de consultar", async () => {
    const { PATCH } = await import("@/app/api/empleo/[id]/route");
    const response = await PATCH(request(`/api/empleo/${LISTING_ID}`, "PATCH", { title: 123 }), { params: { id: LISTING_ID } } as never);
    expect(response.status).toBe(400);
    expect(selectQueue).toHaveLength(0);
  });

  it("rechaza id inválido en DELETE antes del lookup", async () => {
    const { DELETE } = await import("@/app/api/empleo/[id]/route");
    const response = await DELETE(request("/api/empleo/no-uuid", "DELETE", undefined), { params: { id: "no-uuid" } } as never);
    expect(response.status).toBe(400);
    expect(selectQueue).toHaveLength(0);
  });

  it("rechaza academia cruzada sin mutación", async () => {
    academyAccess = { allowed: false };
    selectQueue.push([{ id: LISTING_ID, academyId: OTHER_ACADEMY_ID, userId: "other-user" }]);
    const { PATCH } = await import("@/app/api/empleo/[id]/route");
    const response = await PATCH(request(`/api/empleo/${LISTING_ID}`, "PATCH", { title: "Oferta válida" }), { params: { id: LISTING_ID } } as never);
    expect(response.status).toBe(403);
    expect(updateCalls).toHaveLength(0);
  });

  it("rechaza DELETE fuera del tenant antes de borrar", async () => {
    selectQueue.push([]);
    const { DELETE } = await import("@/app/api/empleo/[id]/route");
    const response = await DELETE(request(`/api/empleo/${LISTING_ID}`, "DELETE", undefined), { params: { id: LISTING_ID } } as never);
    expect(response.status).toBe(404);
    expect(deleteCalls).toHaveLength(0);
  });
});

describe("ZAL-957: record-payment", () => {
  beforeEach(() => {
    vi.resetModules();
    selectQueue = [];
    updateCalls = [];
    updateResult = [];
    capabilityAccess = { allowed: true };
    mockTenant("admin");
    mockDb();
    vi.mock("@/lib/authz/resource-scope", () => ({
      authorizeAcademyCapability: vi.fn(async () => capabilityAccess),
    }));
  });

  it("rechaza capability antes del SELECT", async () => {
    capabilityAccess = { allowed: false };
    const { POST } = await import("@/app/api/quick-actions/record-payment/route");
    const response = await POST(request("/api/quick-actions/record-payment", "POST", { chargeId: CHARGE_ID, academyId: ACADEMY_ID, amountCents: 2500, paymentMethod: "cash" }), {} as never);
    expect(response.status).toBe(403);
    expect(selectQueue).toHaveLength(0);
  });

  it("rechaza payload estricto y no consulta", async () => {
    const { POST } = await import("@/app/api/quick-actions/record-payment/route");
    const response = await POST(request("/api/quick-actions/record-payment", "POST", { chargeId: CHARGE_ID, academyId: ACADEMY_ID, amountCents: -1, paymentMethod: "bitcoin", extra: true }), {} as never);
    expect(response.status).toBe(400);
    expect(selectQueue).toHaveLength(0);
  });

  it("rechaza importe distinto antes de mutar", async () => {
    selectQueue.push([{ id: CHARGE_ID, tenantId: TENANT_ID, academyId: ACADEMY_ID, amountCents: 2500, status: "pending" }]);
    const { POST } = await import("@/app/api/quick-actions/record-payment/route");
    const response = await POST(request("/api/quick-actions/record-payment", "POST", { chargeId: CHARGE_ID, academyId: ACADEMY_ID, amountCents: 1000, paymentMethod: "cash" }), {} as never);
    expect(response.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it("rechaza una carrera CAS que no actualiza", async () => {
    selectQueue.push([{ id: CHARGE_ID, tenantId: TENANT_ID, academyId: ACADEMY_ID, amountCents: 2500, status: "pending" }]);
    const { POST } = await import("@/app/api/quick-actions/record-payment/route");
    const response = await POST(request("/api/quick-actions/record-payment", "POST", { chargeId: CHARGE_ID, academyId: ACADEMY_ID, amountCents: 2500, paymentMethod: "cash" }, { "Idempotency-Key": "qa-key" }), {} as never);
    expect(response.status).toBe(409);
    expect(updateCalls).toHaveLength(1);
  });

  it("no devuelve un cargo de otro tenant", async () => {
    selectQueue.push([]);
    const { POST } = await import("@/app/api/quick-actions/record-payment/route");
    const response = await POST(request("/api/quick-actions/record-payment", "POST", { chargeId: CHARGE_ID, academyId: ACADEMY_ID, amountCents: 2500, paymentMethod: "cash" }), {} as never);
    expect(response.status).toBe(404);
    expect(updateCalls).toHaveLength(0);
  });
});

describe("ZAL-957: metrics y dev-session", () => {
  beforeEach(() => {
    vi.resetModules();
    mockTenant("admin");
    mockDb();
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL_ENV;
  });

  it("resetea métricas solo con rol autorizado y runtime local", async () => {
    const { metrics } = await import("@/lib/metrics");
    metrics.requests.total = 4;
    const { POST } = await import("@/app/api/metrics/route");
    expect((await POST(new Request("http://localhost/api/metrics", { method: "POST" }), {} as never)).status).toBe(200);
    expect(metrics.requests.total).toBe(0);
    activeRole = "coach";
    expect((await POST(new Request("http://localhost/api/metrics", { method: "POST" }), {} as never)).status).toBe(403);
    process.env.VERCEL_ENV = "preview";
    expect((await POST(new Request("http://localhost/api/metrics", { method: "POST" }), {} as never)).status).toBe(403);
  });

  it("mantiene snapshot vacío ante dos resets concurrentes", async () => {
    const { metrics } = await import("@/lib/metrics");
    metrics.requests.total = 7;
    const { POST } = await import("@/app/api/metrics/route");
    const responses = await Promise.all([
      POST(new Request("http://localhost/api/metrics", { method: "POST" }), {} as never),
      POST(new Request("http://localhost/api/metrics", { method: "POST" }), {} as never),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(metrics.requests).toEqual({ total: 0, byMethod: {}, byStatus: {} });
  });

  it("evalúa dev-session en cada request/runtime", async () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION = "true";
    const { isDevSessionEnabled } = await import("@/lib/dev");
    expect(isDevSessionEnabled()).toBe(true);
    process.env.VERCEL_ENV = "preview";
    expect(isDevSessionEnabled()).toBe(false);
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "production";
    expect(isDevSessionEnabled()).toBe(false);
  });
});

describe("ZAL-957: eventos públicos, capability y fanout", () => {
  beforeEach(() => {
    vi.resetModules();
    selectQueue = [];
    updateCalls = [];
    capabilityAccess = { allowed: false };
    mockTenant("coach");
    mockDb();
    vi.mock("@/lib/authz/resource-scope", () => ({ authorizeAcademyCapability: vi.fn(async () => capabilityAccess) }));
    vi.mock("@/lib/rate-limit", () => ({
      withRateLimit: (handler: (request: Request, context: unknown) => Promise<Response>) => handler,
      getUserIdentifier: vi.fn(() => "qa-user"),
      rateLimit: vi.fn(async () => ({ success: true, limit: 30, remaining: 29, reset: 0 })),
    }));
    vi.mock("@/lib/notifications/email-service", () => ({ sendBulkEmails: vi.fn(async () => ({ sent: 1, errors: 0 })) }));
    vi.mock("@/config", () => ({ config: { brevo: { supportEmail: "support@example.test" } } }));
  });

  it("devuelve 404 para evento interno fuera del tenant", async () => {
    selectQueue.push([], []);
    const { GET } = await import("@/app/api/events/[id]/route");
    const response = await GET(new Request(`http://localhost/api/events/${EVENT_ID}`), { params: Promise.resolve({ id: EVENT_ID }) });
    expect(response.status).toBe(404);
  });

  it("sirve evento público sin exigir scope interno", async () => {
    selectQueue.push([{ id: EVENT_ID, tenantId: TENANT_ID, academyId: ACADEMY_ID, isPublic: true, title: "Evento QA" }], [{ id: ACADEMY_ID, name: "Academia QA" }]);
    const { GET } = await import("@/app/api/events/[id]/route");
    const response = await GET(new Request(`http://localhost/api/events/${EVENT_ID}`), { params: Promise.resolve({ id: EVENT_ID }) });
    expect(response.status).toBe(200);
  });

  it("no permite PATCH sin events:update antes de mutar", async () => {
    selectQueue.push([{ id: EVENT_ID, academyId: ACADEMY_ID, tenantId: TENANT_ID, sportConfigId: null }], [{ tenantId: TENANT_ID }]);
    const { PATCH } = await import("@/app/api/events/[id]/route");
    const response = await PATCH(request(`/api/events/${EVENT_ID}`, "PATCH", { title: "No autorizado" }), { params: Promise.resolve({ id: EVENT_ID }) } as never);
    expect(response.status).toBe(403);
    expect(updateCalls).toHaveLength(0);
  });

  it("filtra destinatarios geográficos por tenant organizador", async () => {
    selectQueue.push(
      [{ tenantId: TENANT_ID, country: "ES", region: "Madrid", city: "Madrid" }],
      [
        { id: ACADEMY_ID, tenantId: TENANT_ID, contactEmail: "same@example.test", ownerId: "owner-1" },
        { id: OTHER_ACADEMY_ID, tenantId: "99999999-9999-9999-9999-999999999999", contactEmail: "other@example.test", ownerId: "owner-2" },
      ],
    );
    const { getAcademiesEmailsByLocation } = await import("@/lib/notifications/event-recipients");
    await expect(getAcademiesEmailsByLocation(ACADEMY_ID, "city", TENANT_ID)).resolves.toEqual(["same@example.test"]);
  });
});
