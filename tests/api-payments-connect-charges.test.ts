import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY_ID = "11111111-1111-4111-8111-111111111111";
const CHARGE_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const PROFILE_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";

const mocks = vi.hoisted(() => ({
  // lib/stripe/connect-service
  getOrCreateConnectAccount: vi.fn(),
  createOnboardingLink: vi.fn(),
  getConnectAccount: vi.fn(),
  refreshConnectAccountStatus: vi.fn(),
  isConnectReady: vi.fn(),
  // lib/stripe/charge-collection-service
  collectCharge: vi.fn(),
  // lib/stripe/refund-service
  refundCharge: vi.fn(),
  // lib/billing/access
  getBillingAcademyAccess: vi.fn(),
  // lib/permissions
  verifyAcademyAccess: vi.fn(),
  // lib/email/triggers
  sendManualPaymentReminder: vi.fn(),
  // lib/authz/resource-scope
  authorizeAcademyCapability: vi.fn(),
  // env (read at call time)
  stripeSecretKey: "sk_test_dummy",
  // DB query queue
  selectResults: [] as unknown[][],
}));

// ============================================================================
// Mocked infrastructure
// ============================================================================

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const method of [
        "from",
        "innerJoin",
        "leftJoin",
        "rightJoin",
        "where",
        "orderBy",
        "groupBy",
        "offset",
      ]) {
        chain[method] = vi.fn(() => chain);
      }
      // Read mocks.selectResults lazily so per-test beforeEach resets work.
      chain.limit = vi.fn(() => {
        const queue = mocks.selectResults;
        return Promise.resolve(queue.length ? (queue.shift() as unknown[]) : []);
      });
      return chain;
    }),
  },
}));

// Bypass real authz wiring — pretend the request already passed tenant
// resolution and reached the inner handler as an owner of TENANT_ID.
vi.mock("@/lib/authz", () => ({
  withTenant:
    (handler: (request: Request, context: unknown) => Promise<Response>) =>
    async (request: Request) =>
      handler(request, {
        tenantId: TENANT_ID,
        userId: USER_ID,
        profile: {
          id: PROFILE_ID,
          tenantId: TENANT_ID,
          role: "owner",
          canLogin: true,
        },
      }),
}));

// Bypass rate limit — the real wrapper would call vercel/kv and add headers.
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit:
    (handler: (request: Request, context?: unknown) => Promise<Response>) =>
    (request: Request, context?: unknown) => handler(request, context),
  getUserIdentifier: vi.fn(() => `user:${USER_ID}`),
  getClientIdentifier: vi.fn(() => "ip:127.0.0.1"),
  getLimitForRoute: vi.fn(() => ({ limit: 100, window: 60 })),
  getVerifiedTenantRateLimitIdentifier: vi.fn(() => "tenant-key"),
  rateLimit: vi.fn(async () => ({ success: true, limit: 100, remaining: 99, reset: 0 })),
  isKvConfigured: vi.fn(() => false),
  RATE_LIMITS: { PUBLIC: { limit: 100, window: 60 } },
}));

// Closure so tests can flip `mocks.stripeSecretKey` and have the route see it.
vi.mock("@/lib/env", () => ({
  getOptionalEnvVar: (key: string) => {
    if (key === "STRIPE_SECRET_KEY") return mocks.stripeSecretKey;
    return undefined;
  },
  isTest: () => true,
}));

vi.mock("@/lib/stripe/connect-service", () => ({
  getOrCreateConnectAccount: mocks.getOrCreateConnectAccount,
  createOnboardingLink: mocks.createOnboardingLink,
  getConnectAccount: mocks.getConnectAccount,
  refreshConnectAccountStatus: mocks.refreshConnectAccountStatus,
  isConnectReady: mocks.isConnectReady,
  syncConnectAccountFromStripe: vi.fn(),
  mapOnboardingStatus: vi.fn(),
}));

vi.mock("@/lib/stripe/charge-collection-service", () => ({
  collectCharge: mocks.collectCharge,
  collectDueChargesForAcademy: vi.fn(),
}));

vi.mock("@/lib/stripe/refund-service", () => ({
  refundCharge: mocks.refundCharge,
}));

vi.mock("@/lib/billing/access", () => ({
  getBillingAcademyAccess: mocks.getBillingAcademyAccess,
}));

vi.mock("@/lib/permissions", () => ({
  verifyAcademyAccess: mocks.verifyAcademyAccess,
}));

vi.mock("@/lib/email/triggers", () => ({
  sendManualPaymentReminder: mocks.sendManualPaymentReminder,
}));

vi.mock("@/lib/authz/resource-scope", () => ({
  authorizeAcademyCapability: mocks.authorizeAcademyCapability,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    apiError: vi.fn(),
  },
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Pre-import all 6 route modules once so per-test first-import cost
// (drizzle schema transform + dotenv/config + Vite SSR transforms) stays
// under the 5s default test timeout.
beforeAll(async () => {
  await Promise.all([
    import("@/app/api/payments/connect/onboard/route"),
    import("@/app/api/payments/connect/status/route"),
    import("@/app/api/payments/connect/refresh/route"),
    import("@/app/api/charges/[chargeId]/collect/route"),
    import("@/app/api/charges/[chargeId]/refund/route"),
    import("@/app/api/charges/[chargeId]/remind/route"),
  ]);
}, 60_000);

// ============================================================================
// POST /api/payments/connect/onboard
// ============================================================================

const importOnboard = () => import("@/app/api/payments/connect/onboard/route");

const ownedAcademy = () => ({
  id: ACADEMY_ID,
  tenantId: TENANT_ID,
  name: "Academia Test",
  ownerProfileId: PROFILE_ID,
  ownerUserId: USER_ID,
  ownerName: "Owner",
});

async function postJson(route: string, body: unknown, method = "POST") {
  return new Request(`http://localhost${route}`, {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/payments/connect/onboard", () => {
beforeEach(() => {
    mocks.authorizeAcademyCapability.mockResolvedValue({ allowed: true });
    mocks.selectResults = [];
    mocks.stripeSecretKey = "sk_test_dummy";
  });

  it("mantiene Connect desactivado aunque haya configuración de test", async () => {
    mocks.stripeSecretKey = "";
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());
    const { POST } = await importOnboard();
    const response = await POST(await postJson("/api/payments/connect/onboard", { academyId: ACADEMY_ID }));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "FAMILY_AUTOMATIC_COLLECTION_DISABLED" });
    expect(mocks.getOrCreateConnectAccount).not.toHaveBeenCalled();
  });

  it("devuelve 400 INVALID_JSON cuando el cuerpo no es JSON valido", async () => {
    const { POST } = await importOnboard();
    const response = await POST(await postJson("/api/payments/connect/onboard", "{not-json"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_JSON" });
  });

  it("devuelve 400 VALIDATION_ERROR cuando academyId no es uuid", async () => {
    const { POST } = await importOnboard();
    const response = await POST(await postJson("/api/payments/connect/onboard", { academyId: "not-a-uuid" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "VALIDATION_ERROR" });
    expect(mocks.getBillingAcademyAccess).not.toHaveBeenCalled();
  });

  it("devuelve 400 VALIDATION_ERROR cuando falta academyId", async () => {
    const { POST } = await importOnboard();
    const response = await POST(await postJson("/api/payments/connect/onboard", {}));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "VALIDATION_ERROR" });
  });

  it("devuelve 403 CONNECT_FORBIDDEN cuando el solicitante no es dueno", async () => {
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(null);
    const { POST } = await importOnboard();
    const response = await POST(await postJson("/api/payments/connect/onboard", { academyId: ACADEMY_ID }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "CONNECT_FORBIDDEN" });
    expect(mocks.getOrCreateConnectAccount).not.toHaveBeenCalled();
    expect(mocks.createOnboardingLink).not.toHaveBeenCalled();
  });

  it("rechaza el onboarding después de validar el acceso Owner", async () => {
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());

    const { POST } = await importOnboard();
    const response = await POST(await postJson("/api/payments/connect/onboard", { academyId: ACADEMY_ID }));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "FAMILY_AUTOMATIC_COLLECTION_DISABLED" });
    expect(mocks.getOrCreateConnectAccount).not.toHaveBeenCalled();
    expect(mocks.createOnboardingLink).not.toHaveBeenCalled();
  });
});

// ============================================================================
// GET /api/payments/connect/status
// ============================================================================

const importStatus = () => import("@/app/api/payments/connect/status/route");

describe("GET /api/payments/connect/status", () => {
  beforeEach(() => {
    mocks.selectResults = [];
  });

  it("devuelve 400 VALIDATION_ERROR cuando falta academyId en query", async () => {
    const { GET } = await importStatus();
    const response = await GET(new Request("http://localhost/api/payments/connect/status"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "VALIDATION_ERROR" });
    expect(mocks.verifyAcademyAccess).not.toHaveBeenCalled();
  });

  it("devuelve 400 VALIDATION_ERROR cuando academyId no es uuid", async () => {
    const { GET } = await importStatus();
    const response = await GET(
      new Request("http://localhost/api/payments/connect/status?academyId=not-a-uuid")
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "VALIDATION_ERROR" });
  });

  it("devuelve 403 cuando el caller no tiene acceso a la academia", async () => {
    mocks.verifyAcademyAccess.mockResolvedValueOnce({
      allowed: false,
      reason: "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED",
    });
    const { GET } = await importStatus();
    const response = await GET(
      new Request(`http://localhost/api/payments/connect/status?academyId=${ACADEMY_ID}`)
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED",
    });
    expect(mocks.getConnectAccount).not.toHaveBeenCalled();
  });

  it("devuelve el contrato manual-only sin consultar cuentas Connect", async () => {
    mocks.verifyAcademyAccess.mockResolvedValueOnce({ allowed: true });

    const { GET } = await importStatus();
    const response = await GET(
      new Request(`http://localhost/api/payments/connect/status?academyId=${ACADEMY_ID}`)
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        connected: false,
        ready: false,
        status: "disabled",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        country: null,
        collectionMode: "manual",
        manualCollectionAvailable: true,
        automaticCollectionEnabled: false,
        disabledReason: "FAMILY_AUTOMATIC_COLLECTION_DISABLED",
      },
    });
    expect(mocks.getConnectAccount).not.toHaveBeenCalled();
  });

  it("no expone una cuenta Connect histórica como habilitada", async () => {
    mocks.verifyAcademyAccess.mockResolvedValueOnce({ allowed: true });

    const { GET } = await importStatus();
    const response = await GET(
      new Request(`http://localhost/api/payments/connect/status?academyId=${ACADEMY_ID}`)
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        connected: false,
        ready: false,
        status: "disabled",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        country: null,
        automaticCollectionEnabled: false,
      },
    });
    expect(mocks.getConnectAccount).not.toHaveBeenCalled();
  });
});

// ============================================================================
// POST /api/payments/connect/refresh
// ============================================================================

const importRefresh = () => import("@/app/api/payments/connect/refresh/route");

describe("POST /api/payments/connect/refresh", () => {
  beforeEach(() => {
    mocks.selectResults = [];
    mocks.stripeSecretKey = "sk_test_dummy";
  });

  it("mantiene Connect desactivado aunque no haya clave Stripe", async () => {
    mocks.stripeSecretKey = "";
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());
    const { POST } = await importRefresh();
    const response = await POST(await postJson("/api/payments/connect/refresh", { academyId: ACADEMY_ID }));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "FAMILY_AUTOMATIC_COLLECTION_DISABLED" });
    expect(mocks.refreshConnectAccountStatus).not.toHaveBeenCalled();
  });

  it("devuelve 400 INVALID_JSON cuando el cuerpo no es JSON valido", async () => {
    const { POST } = await importRefresh();
    const response = await POST(await postJson("/api/payments/connect/refresh", "{not-json"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_JSON" });
  });

  it("devuelve 400 VALIDATION_ERROR cuando falta academyId", async () => {
    const { POST } = await importRefresh();
    const response = await POST(await postJson("/api/payments/connect/refresh", {}));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "VALIDATION_ERROR" });
    expect(mocks.getBillingAcademyAccess).not.toHaveBeenCalled();
  });

  it("devuelve 403 CONNECT_FORBIDDEN cuando el caller no es dueno", async () => {
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(null);
    const { POST } = await importRefresh();
    const response = await POST(await postJson("/api/payments/connect/refresh", { academyId: ACADEMY_ID }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "CONNECT_FORBIDDEN" });
    expect(mocks.refreshConnectAccountStatus).not.toHaveBeenCalled();
  });

  it("rechaza la sincronización tras validar el acceso Owner", async () => {
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());

    const { POST } = await importRefresh();
    const response = await POST(await postJson("/api/payments/connect/refresh", { academyId: ACADEMY_ID }));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "FAMILY_AUTOMATIC_COLLECTION_DISABLED" });
    expect(mocks.refreshConnectAccountStatus).not.toHaveBeenCalled();
  });

  it("no sincroniza el estado Connect aunque existan recursos antiguos", async () => {
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());

    const { POST } = await importRefresh();
    const response = await POST(await postJson("/api/payments/connect/refresh", { academyId: ACADEMY_ID }));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "FAMILY_AUTOMATIC_COLLECTION_DISABLED" });
    expect(mocks.refreshConnectAccountStatus).not.toHaveBeenCalled();
  });
});

// ============================================================================
// POST /api/charges/[chargeId]/collect
// ============================================================================

const importCollect = () => import("@/app/api/charges/[chargeId]/collect/route");

describe("POST /api/charges/[chargeId]/collect", () => {
  beforeEach(() => {
    mocks.authorizeAcademyCapability.mockResolvedValue({ allowed: true });
    mocks.selectResults = [];
  });

  it("devuelve 404 CHARGE_NOT_FOUND cuando el cargo no existe", async () => {
    mocks.selectResults.push([]);

    const { POST } = await importCollect();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/collect`, { method: "POST" })
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "CHARGE_NOT_FOUND" });
    expect(mocks.verifyAcademyAccess).not.toHaveBeenCalled();
    expect(mocks.collectCharge).not.toHaveBeenCalled();
  });

  it("devuelve 403 cuando el caller no tiene acceso a la academia del cargo", async () => {
    mocks.selectResults.push([{ academyId: ACADEMY_ID }]);
    mocks.authorizeAcademyCapability.mockResolvedValueOnce({
      allowed: false,
      reason: "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED",
    });

    const { POST } = await importCollect();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/collect`, { method: "POST" })
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED",
    });
    expect(mocks.collectCharge).not.toHaveBeenCalled();
  });

  it("rechaza el cobro después de validar el tenant y la academia", async () => {
    mocks.selectResults.push([{ tenantId: TENANT_ID, academyId: ACADEMY_ID }]);
    mocks.authorizeAcademyCapability.mockResolvedValueOnce({ allowed: true });

    const { POST } = await importCollect();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/collect`, { method: "POST" })
    );
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "FAMILY_AUTOMATIC_COLLECTION_DISABLED" });
    expect(mocks.collectCharge).not.toHaveBeenCalled();
  });

});

// ============================================================================
// POST /api/charges/[chargeId]/refund
// ============================================================================

const importRefund = () => import("@/app/api/charges/[chargeId]/refund/route");

describe("POST /api/charges/[chargeId]/refund", () => {
  beforeEach(() => {
    mocks.selectResults = [];
  });

  it("devuelve 400 VALIDATION_ERROR cuando amountCents es negativo", async () => {
    const { POST } = await importRefund();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/refund`, {
        method: "POST",
        body: JSON.stringify({ amountCents: -50 }),
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "VALIDATION_ERROR" });
    expect(mocks.refundCharge).not.toHaveBeenCalled();
  });

  it("devuelve 400 VALIDATION_ERROR cuando reason excede 500 caracteres", async () => {
    const { POST } = await importRefund();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/refund`, {
        method: "POST",
        body: JSON.stringify({ reason: "x".repeat(501) }),
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "VALIDATION_ERROR" });
    expect(mocks.refundCharge).not.toHaveBeenCalled();
  });

  it("devuelve 404 CHARGE_NOT_FOUND cuando el cargo no existe", async () => {
    mocks.selectResults.push([]);

    const { POST } = await importRefund();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/refund`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "CHARGE_NOT_FOUND" });
    expect(mocks.getBillingAcademyAccess).not.toHaveBeenCalled();
  });

  it("devuelve 403 REFUND_FORBIDDEN cuando el caller no es dueno", async () => {
    mocks.selectResults.push([{ academyId: ACADEMY_ID }]);
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(null);

    const { POST } = await importRefund();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/refund`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "REFUND_FORBIDDEN" });
    expect(mocks.refundCharge).not.toHaveBeenCalled();
  });

  it("rechaza el reembolso después de validar el acceso Owner", async () => {
    mocks.selectResults.push([{ academyId: ACADEMY_ID }]);
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());

    const { POST } = await importRefund();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/refund`, {
        method: "POST",
        body: JSON.stringify({ amountCents: 1000, reason: "ajuste" }),
      })
    );
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "FAMILY_AUTOMATIC_COLLECTION_DISABLED" });
    expect(mocks.refundCharge).not.toHaveBeenCalled();
  });

  it("no solicita un reembolso total aunque el body esté vacío", async () => {
    mocks.selectResults.push([{ academyId: ACADEMY_ID }]);
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());

    const { POST } = await importRefund();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/refund`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(response.status).toBe(410);
    expect(mocks.refundCharge).not.toHaveBeenCalled();
  });

  it("no deriva al servicio un reembolso en el lanzamiento manual-only", async () => {
    mocks.selectResults.push([{ academyId: ACADEMY_ID }]);
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());

    const { POST } = await importRefund();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/refund`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "FAMILY_AUTOMATIC_COLLECTION_DISABLED" });
    expect(mocks.refundCharge).not.toHaveBeenCalled();
  });
});

// ============================================================================
// POST /api/charges/[chargeId]/remind
// ============================================================================

const importRemind = () => import("@/app/api/charges/[chargeId]/remind/route");

describe("POST /api/charges/[chargeId]/remind", () => {
  beforeEach(() => {
    mocks.selectResults = [];
  });

  it("devuelve 404 CHARGE_NOT_FOUND cuando el cargo no existe", async () => {
    mocks.selectResults.push([]);

    const { POST } = await importRemind();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/remind`, { method: "POST" })
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "CHARGE_NOT_FOUND" });
    expect(mocks.authorizeAcademyCapability).not.toHaveBeenCalled();
    expect(mocks.sendManualPaymentReminder).not.toHaveBeenCalled();
  });

  it("devuelve 404 CHARGE_NOT_FOUND cuando el caller no tiene billing:update", async () => {
    mocks.selectResults.push([{ tenantId: TENANT_ID, academyId: ACADEMY_ID }]);
    mocks.authorizeAcademyCapability.mockResolvedValueOnce({
      allowed: false,
      reason: "PERMISSION_DENIED",
    });

    const { POST } = await importRemind();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/remind`, { method: "POST" })
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "CHARGE_NOT_FOUND" });
    expect(mocks.sendManualPaymentReminder).not.toHaveBeenCalled();
    expect(mocks.authorizeAcademyCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceTenantId: TENANT_ID,
        academyId: ACADEMY_ID,
        permission: "billing:update",
      })
    );
  });

  it("devuelve 200 con sentTo cuando el recordatorio se envia", async () => {
    mocks.selectResults.push([{ tenantId: TENANT_ID, academyId: ACADEMY_ID }]);
    mocks.authorizeAcademyCapability.mockResolvedValueOnce({ allowed: true });
    mocks.sendManualPaymentReminder.mockResolvedValueOnce({
      ok: true,
      sentTo: "padres@example.com",
    });

    const { POST } = await importRemind();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/remind`, { method: "POST" })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { sentTo: "padres@example.com" },
    });
    expect(mocks.sendManualPaymentReminder).toHaveBeenCalledWith({
      chargeId: CHARGE_ID,
      tenantId: TENANT_ID,
    });
  });

  it("devuelve 409 CHARGE_ALREADY_SETTLED si el cargo ya esta pagado", async () => {
    mocks.selectResults.push([{ tenantId: TENANT_ID, academyId: ACADEMY_ID }]);
    mocks.authorizeAcademyCapability.mockResolvedValueOnce({ allowed: true });
    mocks.sendManualPaymentReminder.mockResolvedValueOnce({
      ok: false,
      reason: "CHARGE_ALREADY_SETTLED",
    });

    const { POST } = await importRemind();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/remind`, { method: "POST" })
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "CHARGE_ALREADY_SETTLED" });
  });

  it("devuelve 409 NO_CONTACT_EMAIL cuando no hay email de familia", async () => {
    mocks.selectResults.push([{ tenantId: TENANT_ID, academyId: ACADEMY_ID }]);
    mocks.authorizeAcademyCapability.mockResolvedValueOnce({ allowed: true });
    mocks.sendManualPaymentReminder.mockResolvedValueOnce({
      ok: false,
      reason: "NO_CONTACT_EMAIL",
    });

    const { POST } = await importRemind();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/remind`, { method: "POST" })
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "NO_CONTACT_EMAIL" });
  });
});
