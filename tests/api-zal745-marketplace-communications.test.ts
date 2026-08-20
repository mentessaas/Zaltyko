import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const ACADEMY_ID = "22222222-2222-2222-2222-222222222222";
const LISTING_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const OTHER_USER_ID = "55555555-5555-5555-5555-555555555555";
const PROFILE_ID = "66666666-6666-6666-6666-666666666666";
const RECIPIENT_ID = "77777777-7777-7777-7777-777777777777";

const mocks = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  insertValues: [] as unknown[],
  insertReturn: [] as unknown[],
  updateSets: [] as unknown[],
  deleteCount: 0,
  userId: "44444444-4444-4444-4444-444444444444" as string | null,
  pushConfigured: true,
  sendPush: vi.fn(),
  createNotification: vi.fn(),
  sendWhatsApp: vi.fn(),
  createMessageHistory: vi.fn(),
  updateMessageHistoryStatus: vi.fn(),
  loggerErrors: [] as unknown[],
}));

function queryChain(result: unknown[] = []) {
  const query: Record<string, any> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "limit", "orderBy"]) {
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
      query.onConflictDoUpdate = vi.fn(() => query);
      query.returning = vi.fn(async () => mocks.insertReturn);
      return query;
    }),
    update: vi.fn(() => {
      const query = queryChain();
      query.set = vi.fn((values: unknown) => {
        mocks.updateSets.push(values);
        return query;
      });
      query.returning = vi.fn(async () => mocks.insertReturn);
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
        userId: USER_ID,
        profile: { id: PROFILE_ID, userId: USER_ID, role: "admin", tenantId: TENANT_ID },
        ...context,
      }),
  withBearerTenant: (handler: (request: Request, context: any) => Promise<Response>) =>
    (request: Request, context: any = {}) =>
      handler(request, {
        tenantId: TENANT_ID,
        userId: USER_ID,
        profile: { id: PROFILE_ID, userId: USER_ID, role: "parent", tenantId: TENANT_ID },
        ...context,
      }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mocks.userId ? { id: mocks.userId } : null } })),
    },
  })),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/bearer-client", () => ({ getBearerToken: vi.fn(() => "synthetic-bearer") }));
vi.mock("@/lib/notifications/push-service", () => ({
  isPushConfigured: vi.fn(() => mocks.pushConfigured),
  sendPushToUser: mocks.sendPush,
}));
vi.mock("@/lib/notifications/notification-service", () => ({ createNotification: mocks.createNotification }));
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsApp: mocks.sendWhatsApp,
  WhatsAppTemplates: {
    attendancePresent: () => "present",
    attendanceAbsent: () => "absent",
    paymentReminder: () => "payment",
    classReminder: () => "class",
    welcome: () => "welcome",
  },
}));
vi.mock("@/lib/communication-service", () => ({
  createMessageHistory: mocks.createMessageHistory,
  updateMessageHistoryStatus: mocks.updateMessageHistoryStatus,
}));
vi.mock("@/lib/classes/get-class-athletes", () => ({ getClassAthletes: vi.fn() }));
vi.mock("@/lib/sport-config/service", () => ({ verifyAcademySportConfig: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn((...args: unknown[]) => mocks.loggerErrors.push(args)),
    warn: vi.fn(), info: vi.fn(), debug: vi.fn(), apiError: vi.fn(),
  },
}));

function request(path: string, method: string, body?: unknown) {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  // withErrorHandler lee nextUrl en errores de validación como lo haría NextRequest.
  Object.defineProperty(request, "nextUrl", { value: new URL(`http://localhost${path}`) });
  return request;
}

function reset() {
  mocks.selectQueue = [];
  mocks.insertValues = [];
  mocks.insertReturn = [];
  mocks.updateSets = [];
  mocks.deleteCount = 0;
  mocks.userId = USER_ID;
  mocks.pushConfigured = true;
  mocks.sendPush.mockReset();
  mocks.sendPush.mockResolvedValue({ sent: 1, failed: 0 });
  mocks.createNotification.mockReset();
  mocks.createNotification.mockResolvedValue(undefined);
  mocks.sendWhatsApp.mockReset();
  mocks.sendWhatsApp.mockResolvedValue({ success: true, messageId: "wa-test-1" });
  mocks.createMessageHistory.mockReset();
  mocks.createMessageHistory.mockResolvedValue({ id: "history-1" });
  mocks.updateMessageHistoryStatus.mockReset();
  mocks.loggerErrors = [];
}

describe("ZAL-745: marketplace ratings y mis-productos", () => {
  beforeEach(reset);

  it("crea una valoración de un listing ajeno", async () => {
    mocks.selectQueue.push(
      [{ id: LISTING_ID }],
      [{ id: PROFILE_ID }],
      [{ listingUserId: OTHER_USER_ID, sellerProfileId: "seller-profile-1" }],
    );
    mocks.insertReturn = [{ id: "rating-1", rating: 5, comment: "Excelente" }];
    const { POST } = await import("@/app/api/marketplace/[id]/ratings/route");
    const response = await POST(
      request(`/api/marketplace/${LISTING_ID}/ratings`, "POST", { rating: 5, comment: "Excelente" }),
      { params: Promise.resolve({ id: LISTING_ID }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.insertValues[0]).toEqual(expect.objectContaining({ reviewerId: PROFILE_ID, rating: 5 }));
  });

  it("rechaza valorar el propio listing sin insertar", async () => {
    mocks.selectQueue.push(
      [{ id: LISTING_ID }],
      [{ id: PROFILE_ID }],
      [{ listingUserId: USER_ID, sellerProfileId: PROFILE_ID }],
    );
    const { POST } = await import("@/app/api/marketplace/[id]/ratings/route");
    const response = await POST(
      request(`/api/marketplace/${LISTING_ID}/ratings`, "POST", { rating: 5 }),
      { params: Promise.resolve({ id: LISTING_ID }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.insertValues).toHaveLength(0);
  });

  it("actualiza un producto propio", async () => {
    mocks.selectQueue.push([{ userId: USER_ID }]);
    mocks.insertReturn = [{ id: LISTING_ID, status: "paused" }];
    const { PATCH } = await import("@/app/api/marketplace/mis-productos/[id]/route");
    const response = await PATCH(
      request(`/api/marketplace/mis-productos/${LISTING_ID}`, "PATCH", { status: "paused", priceCents: 2500 }),
      { params: Promise.resolve({ id: LISTING_ID }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateSets[0]).toEqual(expect.objectContaining({ status: "paused", priceCents: 2500 }));
  });

  it("rechaza actualizar un producto de otro usuario sin mutar", async () => {
    mocks.selectQueue.push([{ userId: OTHER_USER_ID }]);
    const { PATCH } = await import("@/app/api/marketplace/mis-productos/[id]/route");
    const response = await PATCH(
      request(`/api/marketplace/mis-productos/${LISTING_ID}`, "PATCH", { status: "sold" }),
      { params: Promise.resolve({ id: LISTING_ID }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.updateSets).toHaveLength(0);
  });

  it("elimina un producto propio", async () => {
    mocks.selectQueue.push([{ userId: USER_ID }]);
    const { DELETE } = await import("@/app/api/marketplace/mis-productos/[id]/route");
    const response = await DELETE(
      request(`/api/marketplace/mis-productos/${LISTING_ID}`, "DELETE"),
      { params: Promise.resolve({ id: LISTING_ID }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteCount).toBe(1);
  });

  it("rechaza eliminar un producto inexistente sin borrar", async () => {
    mocks.selectQueue.push([]);
    const { DELETE } = await import("@/app/api/marketplace/mis-productos/[id]/route");
    const response = await DELETE(
      request(`/api/marketplace/mis-productos/${LISTING_ID}`, "DELETE"),
      { params: Promise.resolve({ id: LISTING_ID }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.deleteCount).toBe(0);
  });
});

describe("ZAL-745: push y push-tokens", () => {
  beforeEach(reset);

  it("envía push solo al destinatario del tenant y crea aviso in-app si se pide", async () => {
    mocks.selectQueue.push([{ id: RECIPIENT_ID }]);
    const { POST } = await import("@/app/api/push/send/route");
    const response = await POST(request("/api/push/send", "POST", {
      userId: RECIPIENT_ID,
      title: "Aviso",
      body: "Entrenamiento mañana",
      alsoCreateInApp: true,
    }));

    expect(response.status).toBe(200);
    expect(mocks.sendPush).toHaveBeenCalledWith(RECIPIENT_ID, expect.objectContaining({ title: "Aviso" }));
    expect(mocks.createNotification).toHaveBeenCalledOnce();
  });

  it("rechaza push cross-tenant antes de enviar", async () => {
    mocks.selectQueue.push([]);
    const { POST } = await import("@/app/api/push/send/route");
    const response = await POST(request("/api/push/send", "POST", {
      userId: RECIPIENT_ID,
      title: "No debe salir",
      body: "Destinatario externo",
    }));

    expect(response.status).toBe(403);
    expect(mocks.sendPush).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("registra un push token bearer y conserva la plataforma", async () => {
    const { POST } = await import("@/app/api/push-tokens/route");
    const response = await POST(request("/api/push-tokens", "POST", { token: "token-test-1", platform: "web" }));

    expect(response.status).toBe(200);
    expect(mocks.insertValues[0]).toEqual(expect.objectContaining({ userId: USER_ID, token: "token-test-1", platform: "web" }));
  });

  it("rechaza registrar un push token vacío sin insertar", async () => {
    const { POST } = await import("@/app/api/push-tokens/route");
    const response = await POST(request("/api/push-tokens", "POST", { token: "" }));

    expect(response.status).toBe(400);
    expect(mocks.insertValues).toHaveLength(0);
  });

  it("elimina un push token del usuario autenticado", async () => {
    const { DELETE } = await import("@/app/api/push-tokens/route");
    const response = await DELETE(request("/api/push-tokens", "DELETE", { token: "token-test-1" }));

    expect(response.status).toBe(200);
    expect(mocks.deleteCount).toBe(1);
  });

  it("rechaza eliminar un push token vacío sin borrar", async () => {
    const { DELETE } = await import("@/app/api/push-tokens/route");
    const response = await DELETE(request("/api/push-tokens", "DELETE", { token: "" }));

    expect(response.status).toBe(400);
    expect(mocks.deleteCount).toBe(0);
  });
});

describe("ZAL-745: whatsapp send/verify", () => {
  beforeEach(() => {
    reset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  });

  it("envía WhatsApp directo con teléfono normalizado", async () => {
    const { POST } = await import("@/app/api/whatsapp/send/route");
    const response = await POST(request("/api/whatsapp/send", "POST", {
      phone: "600 123 456",
      message: "Hola {{name}}",
    }));

    expect(response.status).toBe(200);
    expect(mocks.sendWhatsApp).toHaveBeenCalledWith("34600123456", "Hola {{name}}", undefined);
  });

  it("rechaza WhatsApp sin teléfono ni destinatarios y no envía", async () => {
    const { POST } = await import("@/app/api/whatsapp/send/route");
    const response = await POST(request("/api/whatsapp/send", "POST", { message: "Mensaje incompleto" }));

    expect(response.status).toBe(400);
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
  });

  it("verifica credenciales WhatsApp en sandbox", async () => {
    const { POST } = await import("@/app/api/whatsapp/verify/route");
    const response = await POST(request("/api/whatsapp/verify", "POST", {
      phone: "+34600123456",
      apiKey: "synthetic-api-key",
    }));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith("https://api.whatsapp.com/v1/credentials", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer synthetic-api-key" }),
    }));
  });

  it("rechaza verificar sin apiKey y documenta el riesgo de recibir secretos en body", async () => {
    // Riesgo explícito: la ruta actual acepta apiKey en JSON y la reenvía al proveedor;
    // este test solo cubre el negativo, no considera seguro ese contrato.
    const fetchMock = vi.mocked(fetch);
    const { POST } = await import("@/app/api/whatsapp/verify/route");
    const response = await POST(request("/api/whatsapp/verify", "POST", { phone: "+34600123456" }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
