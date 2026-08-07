import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobertura del handler HTTP `POST /api/charges/[chargeId]/collect`.
 *
 * El test de integración `tests/lib/stripe-charge-collection.integration.test.ts`
 * ya cubre el servicio (`collectCharge`) cuando el banco exige SCA y devuelve
 * `{ ok: false, status: "requires_action", paymentIntentId, clientSecret }`.
 * Aquí se congela el contrato HTTP que traduce ese resultado en un 409
 * `REQUIRES_ACTION` para el dashboard del owner (`StudentChargesTab.handleCollectCard`)
 * y el portal familia (`MyPaymentsWidget.payCharge`).
 *
 * ZAL-10 cerró el gap que ZAL-9 documentó: el body 409 ahora incluye `details`
 * con `clientSecret`, `stripeAccountId`, `publishableKey` y `paymentIntentId`,
 * de forma que ambos clientes pueden lanzar `stripe.confirmCardPayment` y
 * completar el 3DS sin salir del producto. El `client_secret` tiene scope de un
 * solo PaymentIntent sobre la cuenta conectada — mismo modelo ya usado en
 * `/api/family/payment-method/setup-intent` para el alta de tarjeta.
 *
 * La ruta del portal familia (`/api/family/charges/[chargeId]/pay`) migró de
 * `NextResponse.json` crudo a `apiError`/`apiSuccess`. El literal `error` se
 * conserva porque `MyPaymentsWidget` lo compara de forma exacta.
 */

const mocks = vi.hoisted(() => ({
  collectChargeMock: vi.fn(),
  verifyAcademyAccessMock: vi.fn(),
  // dbLike capturado por prueba (insert/select/update) para aserciones
  selectedCharges: [] as any[],
  // Portal familia: usuario autenticado y resolución de acceso al cargo.
  getUserMock: vi.fn(),
  resolveFamilyChargeAccessMock: vi.fn(),
}));

// `withTenant` se reemplaza por un passthrough que inyecta un perfil owner/tenant.
// Mockeamos el módulo entero para no arrastrar la implementación real (resolveUserId,
// getCurrentProfile, getTenantId, permisos, rate-limit por tenant) que ya tiene sus
// propios tests. La lógica de auth vive en tests/authz-* y en `pnpm test:rls:local`.
vi.mock("@/lib/authz", () => ({
  withTenant:
    (handler: (request: Request, context: any) => Promise<Response>) =>
    (request: Request, ctx: any = {}) =>
      handler(request, {
        tenantId: "tenant-1",
        userId: "user-1",
        profile: {
          id: "profile-1",
          userId: "user-1",
          role: "owner",
          tenantId: "tenant-1",
          canLogin: true,
        },
        ...ctx,
      }),
}));

// `withRateLimit` se vuelve passthrough y `getUserIdentifier` devuelve una clave
// estable. La política de rate-limit tiene su propia suite (`tests/lib/...`).
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit:
    (handler: (request: Request, context: any) => Promise<Response>) =>
    (request: Request, context: any = {}) =>
      handler(request, context),
  getUserIdentifier: () => "user:1:test",
  rateLimit: vi.fn().mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 }),
  getLimitForRoute: () => ({ limit: 10, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: vi.fn(() => "tenant:tenant-1:user:1"),
}));

vi.mock("@/lib/permissions", () => ({
  verifyAcademyAccess: (...args: any[]) => mocks.verifyAcademyAccessMock(...args),
}));

vi.mock("@/lib/stripe/charge-collection-service", () => ({
  collectCharge: (...args: any[]) => mocks.collectChargeMock(...args),
}));

// La clave publicable de Stripe viaja en el body 409 para que el cliente pueda
// inicializar Stripe.js sobre la cuenta conectada (mismo patrón que el alta de
// tarjeta en `/api/family/payment-method/setup-intent`).
vi.mock("@/lib/env", () => ({
  getOptionalEnvVar: (name: string) =>
    name === "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" ? "pk_test_123" : undefined,
}));

// Chain mínima de drizzle: solo el `select(...).from(...).where(...).limit(...)`
// que hace la ruta para localizar el cargo por id. `charges` se importa del
// schema — proveemos un sentinel `{ id: "charges.id" }` y dejamos que el
// chain devuelva lo que el test haya metido en `mocks.selectedCharges`.
vi.mock("@/db/schema", () => ({
  charges: { id: "charges.id", academyId: "charges.academyId" },
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(mocks.selectedCharges)),
        })),
      })),
    })),
  },
}));

let POST: typeof import("@/app/api/charges/[chargeId]/collect/route").POST;

// --- Mocks de la ruta del portal familia (`/api/family/charges/[id]/pay`) ---
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn(), getAll: vi.fn(() => []) })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: (...args: any[]) => mocks.getUserMock(...args) },
  })),
}));

vi.mock("@/lib/family/payment-access", () => ({
  resolveFamilyChargeAccess: (...args: any[]) => mocks.resolveFamilyChargeAccessMock(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

let FAMILY_POST: typeof import("@/app/api/family/charges/[chargeId]/pay/route").POST;

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.selectedCharges = [{ id: "charge_1", academyId: "academy_1" }];
  mocks.verifyAcademyAccessMock.mockResolvedValue({ allowed: true });
  mocks.getUserMock.mockResolvedValue({
    data: { user: { id: "user-parent", email: "madre@example.com" } },
  });
  mocks.resolveFamilyChargeAccessMock.mockResolvedValue({
    id: "charge_1",
    academyId: "academy_1",
  });
  if (!POST) {
    const mod = await import("@/app/api/charges/[chargeId]/collect/route");
    POST = mod.POST;
  }
  if (!FAMILY_POST) {
    const mod = await import("@/app/api/family/charges/[chargeId]/pay/route");
    FAMILY_POST = mod.POST;
  }
});

describe("POST /api/charges/[chargeId]/collect — contrato HTTP", () => {
  it("devuelve 409 REQUIRES_ACTION con el clientSecret del PaymentIntent (recuperacion SCA)", async () => {
    mocks.collectChargeMock.mockResolvedValue({
      ok: false,
      status: "requires_action",
      paymentIntentId: "pi_sca_42",
      clientSecret: "pi_sca_42_secret_abc",
      stripeAccountId: "acct_academy_1",
    });

    const request = new Request(
      "http://localhost/api/charges/charge_1/collect",
      { method: "POST" }
    );

    const response = await POST(request, {
      params: Promise.resolve({ chargeId: "charge_1" }),
    });

    // === STATUS ===
    expect(response.status).toBe(409);

    const body = await response.json();

    // === CODE / ERROR / MESSAGE ===
    expect(body).toMatchObject({
      ok: false,
      error: "REQUIRES_ACTION",
      code: "REQUIRES_ACTION",
      message: expect.stringContaining("autenticación"),
    });

    // === ZAL-10: el 409 ya es accionable. `details` lleva todo lo que el cliente
    // necesita para lanzar `stripe.confirmCardPayment` sobre la cuenta conectada
    // sin sacar al usuario del producto.
    expect(body.details).toEqual({
      paymentIntentId: "pi_sca_42",
      clientSecret: "pi_sca_42_secret_abc",
      stripeAccountId: "acct_academy_1",
      publishableKey: "pk_test_123",
    });

    // === El servicio subyacente recibió el id del cargo.
    expect(mocks.collectChargeMock).toHaveBeenCalledTimes(1);
    expect(mocks.collectChargeMock).toHaveBeenCalledWith("charge_1");
  });

  it("omite `details` si Stripe no devolvió client_secret (no se puede recuperar)", async () => {
    mocks.collectChargeMock.mockResolvedValue({
      ok: false,
      status: "requires_action",
      paymentIntentId: "pi_sca_43",
      clientSecret: null,
      stripeAccountId: "acct_academy_1",
    });

    const response = await POST(
      new Request("http://localhost/api/charges/charge_1/collect", { method: "POST" }),
      { params: Promise.resolve({ chargeId: "charge_1" }) }
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("REQUIRES_ACTION");
    expect(body).not.toHaveProperty("details");
  });

  it("devuelve 200 con {status: 'paid', paymentIntentId} cuando el cobro succeeded", async () => {
    mocks.collectChargeMock.mockResolvedValue({
      ok: true,
      status: "paid",
      paymentIntentId: "pi_ok_1",
    });

    const response = await POST(
      new Request("http://localhost/api/charges/charge_1/collect", { method: "POST" }),
      { params: Promise.resolve({ chargeId: "charge_1" }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: { status: "paid", paymentIntentId: "pi_ok_1" },
    });
  });

  it("devuelve 409 COLLECTION_SKIPPED cuando el servicio omite el cargo", async () => {
    mocks.collectChargeMock.mockResolvedValue({
      ok: false,
      status: "skipped",
      reason: "NOT_COLLECTIBLE:paid",
    });

    const response = await POST(
      new Request("http://localhost/api/charges/charge_1/collect", { method: "POST" }),
      { params: Promise.resolve({ chargeId: "charge_1" }) }
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: "COLLECTION_SKIPPED",
      code: "COLLECTION_SKIPPED",
      message: "NOT_COLLECTIBLE:paid",
    });
  });

  it("devuelve 402 COLLECTION_FAILED cuando la tarjeta es rechazada", async () => {
    mocks.collectChargeMock.mockResolvedValue({
      ok: false,
      status: "failed",
      reason: "card_declined",
      paymentIntentId: "pi_3",
    });

    const response = await POST(
      new Request("http://localhost/api/charges/charge_1/collect", { method: "POST" }),
      { params: Promise.resolve({ chargeId: "charge_1" }) }
    );

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: "COLLECTION_FAILED",
      code: "COLLECTION_FAILED",
      message: "card_declined",
    });
  });

  it("devuelve 404 CHARGE_NOT_FOUND si el cargo no existe", async () => {
    mocks.selectedCharges = [];

    const response = await POST(
      new Request("http://localhost/api/charges/missing/collect", { method: "POST" }),
      { params: Promise.resolve({ chargeId: "missing" }) }
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: "CHARGE_NOT_FOUND",
      code: "CHARGE_NOT_FOUND",
    });
    expect(mocks.collectChargeMock).not.toHaveBeenCalled();
  });

  it("devuelve 403 cuando verifyAcademyAccess deniega al tenant del cargo", async () => {
    mocks.verifyAcademyAccessMock.mockResolvedValue({
      allowed: false,
      reason: "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED",
    });

    const response = await POST(
      new Request("http://localhost/api/charges/charge_1/collect", { method: "POST" }),
      { params: Promise.resolve({ chargeId: "charge_1" }) }
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED",
    });
    expect(mocks.collectChargeMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 CHARGE_ID_REQUIRED si el handler no recibe chargeId en la URL", async () => {
    // Forzamos al regex interno del handler a no encontrar chargeId.
    const response = await POST(
      new Request("http://localhost/api/charges//collect", { method: "POST" }),
      { params: Promise.resolve({}) }
    );

    // El handler matchea `^\/api\/charges\/([^/]+)\/collect`; sin segmento,
    // devuelve 400 CHARGE_ID_REQUIRED sin tocar DB ni collectCharge.
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: "CHARGE_ID_REQUIRED",
    });
    expect(mocks.collectChargeMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/family/charges/[chargeId]/pay — contrato SCA del portal familia", () => {
  it("devuelve 409 REQUIRES_ACTION con clientSecret y formato apiError", async () => {
    mocks.collectChargeMock.mockResolvedValue({
      ok: false,
      status: "requires_action",
      paymentIntentId: "pi_sca_99",
      clientSecret: "pi_sca_99_secret_xyz",
      stripeAccountId: "acct_academy_1",
    });

    const response = await FAMILY_POST(
      new Request("http://localhost/api/family/charges/charge_1/pay", { method: "POST" })
    );

    expect(response.status).toBe(409);
    const body = await response.json();

    // `MyPaymentsWidget.payCharge` sigue comparando `json.error === "REQUIRES_ACTION"`
    // literalmente. `apiError` mantiene ese literal en `error` además de `code`.
    expect(body).toMatchObject({
      ok: false,
      error: "REQUIRES_ACTION",
      code: "REQUIRES_ACTION",
    });

    // ZAL-10: la familia ya puede completar el 3DS desde el portal.
    expect(body.details).toEqual({
      paymentIntentId: "pi_sca_99",
      clientSecret: "pi_sca_99_secret_xyz",
      stripeAccountId: "acct_academy_1",
      publishableKey: "pk_test_123",
    });
  });

  it("preserva los literales de error que el widget compara (NO_SAVED_CARD)", async () => {
    mocks.collectChargeMock.mockResolvedValue({
      ok: false,
      status: "skipped",
      reason: "NO_SAVED_CARD",
    });

    const response = await FAMILY_POST(
      new Request("http://localhost/api/family/charges/charge_1/pay", { method: "POST" })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "NO_SAVED_CARD",
    });
  });

  it("devuelve 200 apiSuccess cuando el cobro succeeded sin SCA", async () => {
    mocks.collectChargeMock.mockResolvedValue({
      ok: true,
      status: "paid",
      paymentIntentId: "pi_ok_9",
    });

    const response = await FAMILY_POST(
      new Request("http://localhost/api/family/charges/charge_1/pay", { method: "POST" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { status: "paid" },
    });
  });

  it("no llama a collectCharge si el cargo no pertenece a un hijo del usuario", async () => {
    mocks.resolveFamilyChargeAccessMock.mockResolvedValue(null);

    const response = await FAMILY_POST(
      new Request("http://localhost/api/family/charges/charge_ajeno/pay", { method: "POST" })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
    expect(mocks.collectChargeMock).not.toHaveBeenCalled();
  });
});
