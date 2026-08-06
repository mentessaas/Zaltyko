import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";
const CHARGE_ID = "22222222-2222-2222-2222-222222222222";
const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const PROFILE_ID = "44444444-4444-4444-4444-444444444444";
const USER_ID = "55555555-5555-5555-5555-555555555555";

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
    mocks.selectResults = [];
    mocks.stripeSecretKey = "sk_test_dummy";
  });

  it("devuelve 503 STRIPE_NOT_CONFIGURED cuando no hay STRIPE_SECRET_KEY", async () => {
    mocks.stripeSecretKey = "";
    const { POST } = await importOnboard();
    const response = await POST(await postJson("/api/payments/connect/onboard", { academyId: ACADEMY_ID }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "STRIPE_NOT_CONFIGURED" });
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

  it("devuelve 200 con onboardingUrl cuando el dueno inicia el flujo", async () => {
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());
    mocks.selectResults.push([{ country: "ES", email: "owner@example.com" }]);
    mocks.getOrCreateConnectAccount.mockResolvedValueOnce({
      id: "row-1",
      tenantId: TENANT_ID,
      academyId: ACADEMY_ID,
      stripeAccountId: "acct_test_123",
      onboardingStatus: "onboarding",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    });
    mocks.createOnboardingLink.mockResolvedValueOnce("https://stripe.com/onboard/acct_test_123");
    mocks.isConnectReady.mockReturnValue(false);

    const { POST } = await importOnboard();
    const response = await POST(await postJson("/api/payments/connect/onboard", { academyId: ACADEMY_ID }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        onboardingUrl: "https://stripe.com/onboard/acct_test_123",
        status: "onboarding",
        chargesEnabled: false,
      },
    });
    expect(mocks.getOrCreateConnectAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        academyId: ACADEMY_ID,
        tenantId: TENANT_ID,
        country: "ES",
        email: "owner@example.com",
        academyName: "Academia Test",
      })
    );
    expect(mocks.createOnboardingLink).toHaveBeenCalledWith("acct_test_123", ACADEMY_ID);
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

  it("devuelve 200 con connected=false cuando no hay cuenta registrada", async () => {
    mocks.verifyAcademyAccess.mockResolvedValueOnce({ allowed: true });
    mocks.getConnectAccount.mockResolvedValueOnce(null);
    mocks.isConnectReady.mockReturnValue(false);

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
        status: "not_connected",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        country: null,
      },
    });
  });

  it("devuelve 200 con todos los flags cuando la cuenta esta habilitada", async () => {
    mocks.verifyAcademyAccess.mockResolvedValueOnce({ allowed: true });
    mocks.getConnectAccount.mockResolvedValueOnce({
      id: "row-1",
      tenantId: TENANT_ID,
      academyId: ACADEMY_ID,
      stripeAccountId: "acct_test_123",
      country: "ES",
      defaultCurrency: "eur",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      onboardingStatus: "enabled",
      lastSyncedAt: new Date("2026-07-29T10:00:00Z"),
    });
    mocks.isConnectReady.mockReturnValue(true);

    const { GET } = await importStatus();
    const response = await GET(
      new Request(`http://localhost/api/payments/connect/status?academyId=${ACADEMY_ID}`)
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        connected: true,
        ready: true,
        status: "enabled",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        country: "ES",
      },
    });
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

  it("devuelve 503 STRIPE_NOT_CONFIGURED cuando no hay STRIPE_SECRET_KEY", async () => {
    mocks.stripeSecretKey = "";
    const { POST } = await importRefresh();
    const response = await POST(await postJson("/api/payments/connect/refresh", { academyId: ACADEMY_ID }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "STRIPE_NOT_CONFIGURED" });
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

  it("devuelve 404 CONNECT_NOT_FOUND cuando la academia no tiene cuenta", async () => {
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());
    mocks.refreshConnectAccountStatus.mockResolvedValueOnce(null);

    const { POST } = await importRefresh();
    const response = await POST(await postJson("/api/payments/connect/refresh", { academyId: ACADEMY_ID }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "CONNECT_NOT_FOUND" });
    expect(mocks.isConnectReady).not.toHaveBeenCalled();
  });

  it("devuelve 200 con el estado sincronizado tras refrescar", async () => {
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());
    mocks.refreshConnectAccountStatus.mockResolvedValueOnce({
      id: "row-1",
      tenantId: TENANT_ID,
      academyId: ACADEMY_ID,
      stripeAccountId: "acct_test_123",
      country: "ES",
      defaultCurrency: "eur",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      onboardingStatus: "enabled",
      lastSyncedAt: new Date("2026-07-29T10:00:00Z"),
    });
    mocks.isConnectReady.mockReturnValue(true);

    const { POST } = await importRefresh();
    const response = await POST(await postJson("/api/payments/connect/refresh", { academyId: ACADEMY_ID }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        ready: true,
        status: "enabled",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      },
    });
    expect(mocks.refreshConnectAccountStatus).toHaveBeenCalledWith(ACADEMY_ID);
  });
});

// ============================================================================
// POST /api/charges/[chargeId]/collect
// ============================================================================

const importCollect = () => import("@/app/api/charges/[chargeId]/collect/route");

describe("POST /api/charges/[chargeId]/collect", () => {
  beforeEach(() => {
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
    mocks.verifyAcademyAccess.mockResolvedValueOnce({
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

  it("devuelve 200 con status=paid cuando collectCharge cobra", async () => {
    mocks.selectResults.push([{ academyId: ACADEMY_ID }]);
    mocks.verifyAcademyAccess.mockResolvedValueOnce({ allowed: true });
    mocks.collectCharge.mockResolvedValueOnce({
      ok: true,
      status: "paid",
      paymentIntentId: "pi_test_123",
    });

    const { POST } = await importCollect();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/collect`, { method: "POST" })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { status: "paid", paymentIntentId: "pi_test_123" },
    });
    expect(mocks.collectCharge).toHaveBeenCalledWith(CHARGE_ID);
  });

  it("devuelve 409 REQUIRES_ACTION si la tarjeta requiere autenticacion SCA", async () => {
    mocks.selectResults.push([{ academyId: ACADEMY_ID }]);
    mocks.verifyAcademyAccess.mockResolvedValueOnce({ allowed: true });
    mocks.collectCharge.mockResolvedValueOnce({
      ok: false,
      status: "requires_action",
      paymentIntentId: "pi_test_456",
    });

    const { POST } = await importCollect();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/collect`, { method: "POST" })
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "REQUIRES_ACTION" });
  });

  it("devuelve 409 COLLECTION_SKIPPED cuando el cargo no se puede cobrar", async () => {
    mocks.selectResults.push([{ academyId: ACADEMY_ID }]);
    mocks.verifyAcademyAccess.mockResolvedValueOnce({ allowed: true });
    mocks.collectCharge.mockResolvedValueOnce({
      ok: false,
      status: "skipped",
      reason: "CONNECT_NOT_READY",
    });

    const { POST } = await importCollect();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/collect`, { method: "POST" })
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "COLLECTION_SKIPPED" });
  });

  it("devuelve 402 COLLECTION_FAILED cuando collectCharge devuelve failed", async () => {
    mocks.selectResults.push([{ academyId: ACADEMY_ID }]);
    mocks.verifyAcademyAccess.mockResolvedValueOnce({ allowed: true });
    mocks.collectCharge.mockResolvedValueOnce({
      ok: false,
      status: "failed",
      reason: "card_declined",
    });

    const { POST } = await importCollect();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/collect`, { method: "POST" })
    );
    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({ error: "COLLECTION_FAILED" });
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

  it("devuelve 200 con refundId y propaga amountCents/reason al servicio", async () => {
    mocks.selectResults.push([{ academyId: ACADEMY_ID }]);
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());
    mocks.refundCharge.mockResolvedValueOnce({ ok: true, refundId: "re_test_123" });

    const { POST } = await importRefund();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/refund`, {
        method: "POST",
        body: JSON.stringify({ amountCents: 1000, reason: "ajuste" }),
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { refundId: "re_test_123" },
    });
    expect(mocks.refundCharge).toHaveBeenCalledWith({
      chargeId: CHARGE_ID,
      amountCents: 1000,
      reason: "ajuste",
      actorUserId: USER_ID,
    });
  });

  it("devuelve 200 sin pasar amountCents/reason cuando el body esta vacio", async () => {
    mocks.selectResults.push([{ academyId: ACADEMY_ID }]);
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());
    mocks.refundCharge.mockResolvedValueOnce({ ok: true, refundId: "re_full" });

    const { POST } = await importRefund();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/refund`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.refundCharge).toHaveBeenCalledWith({
      chargeId: CHARGE_ID,
      amountCents: undefined,
      reason: undefined,
      actorUserId: USER_ID,
    });
  });

  it("devuelve 409 REFUND_FAILED cuando refundCharge falla", async () => {
    mocks.selectResults.push([{ academyId: ACADEMY_ID }]);
    mocks.getBillingAcademyAccess.mockResolvedValueOnce(ownedAcademy());
    mocks.refundCharge.mockResolvedValueOnce({ ok: false, reason: "INVALID_AMOUNT" });

    const { POST } = await importRefund();
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/refund`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "REFUND_FAILED" });
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
