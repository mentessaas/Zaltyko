/**
 * Cobertura HTTP de las rutas /api/family/payment-method y
 * /api/family/payment-method/setup-intent, y /api/family/charges/[chargeId]/{pay,receipt}.
 *
 * Estas rutas no usan withTenant (auth via cookies Supabase + authz manual
 * con resolveFamilyPaymentAccess / resolveFamilyChargeAccess). Los tests
 * mockean el cliente Supabase server, los servicios de acceso de familia y
 * los servicios de Stripe/DB pertinentes para verificar el comportamiento
 * HTTP (validacion, auth, rate-limit, respuestas) sin necesidad de red.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const CUSTOMER_ID = "cus_test_1";
const STRIPE_ACCOUNT_ID = "acct_test_1";
const TENANT_ID = "44444444-4444-4444-8444-444444444444";
const PAYMENT_METHOD_ID = "pm_test_1";
const CHARGE_ID = "55555555-5555-4555-8555-555555555555";
const ATHLETE_ID = "66666666-6666-4666-8666-666666666666";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  profile: null as null | { id: string; name: string },
}));

const accessState = vi.hoisted(() => ({
  paymentAccess: null as null | {
    allowed: boolean;
    reason?: string;
    stripeAccountId?: string;
    tenantId?: string;
    connectReady?: boolean;
  },
  chargeAccess: null as null | { id: string; athleteId: string } | "__missing__",
}));

const serviceMocks = vi.hoisted(() => ({
  getFamilyCustomer: vi.fn(),
  saveDefaultPaymentMethod: vi.fn(),
  removeDefaultPaymentMethod: vi.fn(),
  getOrCreateFamilyCustomer: vi.fn(),
  createFamilySetupIntent: vi.fn(),
  collectCharge: vi.fn(),
}));

const dbState = vi.hoisted(() => ({
  receiptRows: [] as Array<{ pdfUrl: string | null; receiptNumber: string }>,
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    getAll: () => [],
    set: () => undefined,
    delete: () => undefined,
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: authState.user },
        error: null,
      })),
    },
  }),
}));

vi.mock("@/lib/authz/profile-service", () => ({
  getCurrentProfile: vi.fn(async () => {
    return authState.profile;
  }),
}));

vi.mock("@/lib/family/payment-access", () => ({
  resolveFamilyPaymentAccess: vi.fn(async () => accessState.paymentAccess),
  resolveFamilyChargeAccess: vi.fn(async () => {
    if (accessState.chargeAccess === "__missing__") return null;
    return accessState.chargeAccess;
  }),
}));

vi.mock("@/lib/stripe/family-customers-service", () => ({
  getFamilyCustomer: serviceMocks.getFamilyCustomer,
  saveDefaultPaymentMethod: serviceMocks.saveDefaultPaymentMethod,
  removeDefaultPaymentMethod: serviceMocks.removeDefaultPaymentMethod,
  getOrCreateFamilyCustomer: serviceMocks.getOrCreateFamilyCustomer,
  createFamilySetupIntent: serviceMocks.createFamilySetupIntent,
}));

vi.mock("@/lib/stripe/charge-collection-service", () => ({
  collectCharge: serviceMocks.collectCharge,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    apiError: vi.fn(),
  },
}));

vi.mock("@/db", () => {
  const selectChain: Record<string, unknown> = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    orderBy: vi.fn(() => selectChain),
    limit: vi.fn(() => {
      const rows = dbState.receiptRows;
      return Promise.resolve(rows);
    }),
  };
  return {
    db: {
      select: vi.fn(() => selectChain),
    },
  };
});

vi.mock("@/db/schema", () => ({
  receipts: { chargeId: "receipts.chargeId", athleteId: "receipts.athleteId", createdAt: "receipts.createdAt" },
}));

vi.mock("@/lib/env", () => ({
  getOptionalEnvVar: vi.fn((key: string) => {
    if (key === "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") return "pk_test_mock";
    return undefined;
  }),
}));

function setAuthed() {
  authState.user = { id: USER_ID, email: "parent@example.com" };
  authState.profile = { id: PROFILE_ID, name: "Madre Test" };
}

function setUnauthed() {
  authState.user = null;
  authState.profile = null;
}

function setPaidAccess() {
  accessState.paymentAccess = {
    allowed: true,
    stripeAccountId: STRIPE_ACCOUNT_ID,
    tenantId: TENANT_ID,
    connectReady: true,
  };
}

function importPaymentMethod() {
  return import("@/app/api/family/payment-method/route");
}

function importSetupIntent() {
  return import("@/app/api/family/payment-method/setup-intent/route");
}

function importChargePay() {
  return import("@/app/api/family/charges/[chargeId]/pay/route");
}

function importChargeReceipt() {
  return import("@/app/api/family/charges/[chargeId]/receipt/route");
}

beforeEach(() => {
  vi.clearAllMocks();
  setUnauthed();
  accessState.paymentAccess = null;
  accessState.chargeAccess = "__missing__";
  dbState.receiptRows = [];
  serviceMocks.getFamilyCustomer.mockReset();
  serviceMocks.saveDefaultPaymentMethod.mockReset();
  serviceMocks.removeDefaultPaymentMethod.mockReset();
  serviceMocks.getOrCreateFamilyCustomer.mockReset();
  serviceMocks.createFamilySetupIntent.mockReset();
  serviceMocks.collectCharge.mockReset();
});

// ---------------------------------------------------------------------------
// /api/family/payment-method
// ---------------------------------------------------------------------------
describe("API /api/family/payment-method", () => {
  describe("GET", () => {
    it("rechaza academyId invalido con 400", async () => {
      const { GET } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method?academyId=not-a-uuid");
      const response = await GET(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("VALIDATION_ERROR");
    });

    it("devuelve 401 si no hay sesion", async () => {
      setUnauthed();
      const { GET } = await importPaymentMethod();
      const request = new Request(`http://localhost/api/family/payment-method?academyId=${ACADEMY_ID}`);
      const response = await GET(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("UNAUTHORIZED");
    });

    it("devuelve 403 cuando resolveFamilyPaymentAccess deniega", async () => {
      setAuthed();
      accessState.paymentAccess = { allowed: false, reason: "NO_CHILD_IN_ACADEMY" };
      const { GET } = await importPaymentMethod();
      const request = new Request(`http://localhost/api/family/payment-method?academyId=${ACADEMY_ID}`);
      const response = await GET(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe("NO_CHILD_IN_ACADEMY");
    });

    it("devuelve hasCard=false y card=null si la familia nunca guardo tarjeta", async () => {
      setAuthed();
      setPaidAccess();
      serviceMocks.getFamilyCustomer.mockResolvedValue(null);

      const { GET } = await importPaymentMethod();
      const request = new Request(`http://localhost/api/family/payment-method?academyId=${ACADEMY_ID}`);
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        hasCard: false,
        connectReady: true,
        card: null,
      });
    });

    it("devuelve las ultimas 4 + brand cuando hay tarjeta guardada", async () => {
      setAuthed();
      setPaidAccess();
      serviceMocks.getFamilyCustomer.mockResolvedValue({
        id: "row-1",
        stripeCustomerId: CUSTOMER_ID,
        defaultPaymentMethodId: PAYMENT_METHOD_ID,
        cardBrand: "visa",
        cardLast4: "4242",
        cardExpMonth: 12,
        cardExpYear: 2030,
      });

      const { GET } = await importPaymentMethod();
      const request = new Request(`http://localhost/api/family/payment-method?academyId=${ACADEMY_ID}`);
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.hasCard).toBe(true);
      expect(body.card).toEqual({
        brand: "visa",
        last4: "4242",
        expMonth: 12,
        expYear: 2030,
      });
    });

    it("devuelve 500 y registra error si el servicio lanza", async () => {
      setAuthed();
      setPaidAccess();
      serviceMocks.getFamilyCustomer.mockRejectedValue(new Error("db down"));

      const { GET } = await importPaymentMethod();
      const request = new Request(`http://localhost/api/family/payment-method?academyId=${ACADEMY_ID}`);
      const response = await GET(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("SERVER_ERROR");
    });
  });

  describe("POST", () => {
    it("rechaza body invalido con 400", async () => {
      const { POST } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: "bad" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("VALIDATION_ERROR");
    });

    it("devuelve 401 si no hay usuario autenticado", async () => {
      setUnauthed();
      const { POST } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: ACADEMY_ID, paymentMethodId: PAYMENT_METHOD_ID }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it("devuelve 403 si el perfil no existe", async () => {
      authState.user = { id: USER_ID, email: "parent@example.com" };
      authState.profile = null;
      const { POST } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: ACADEMY_ID, paymentMethodId: PAYMENT_METHOD_ID }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe("PROFILE_NOT_FOUND");
    });

    it("devuelve 409 si la academia no tiene Stripe Connect listo", async () => {
      setAuthed();
      accessState.paymentAccess = {
        allowed: true,
        stripeAccountId: undefined,
        connectReady: false,
      };
      const { POST } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: ACADEMY_ID, paymentMethodId: PAYMENT_METHOD_ID }),
      });
      const response = await POST(request);

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe("ACADEMY_PAYMENTS_NOT_READY");
    });

    it("guarda el payment method y devuelve la tarjeta display", async () => {
      setAuthed();
      setPaidAccess();
      serviceMocks.saveDefaultPaymentMethod.mockResolvedValue({
        id: "row-1",
        stripeCustomerId: CUSTOMER_ID,
        defaultPaymentMethodId: PAYMENT_METHOD_ID,
        cardBrand: "mastercard",
        cardLast4: "5454",
        cardExpMonth: 4,
        cardExpYear: 2029,
      });

      const { POST } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: ACADEMY_ID, paymentMethodId: PAYMENT_METHOD_ID }),
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(serviceMocks.saveDefaultPaymentMethod).toHaveBeenCalledWith({
        academyId: ACADEMY_ID,
        profileId: PROFILE_ID,
        paymentMethodId: PAYMENT_METHOD_ID,
        stripeAccountId: STRIPE_ACCOUNT_ID,
      });
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.card).toEqual({
        brand: "mastercard",
        last4: "5454",
        expMonth: 4,
        expYear: 2029,
      });
    });

    it("propaga 500 si saveDefaultPaymentMethod revienta", async () => {
      setAuthed();
      setPaidAccess();
      serviceMocks.saveDefaultPaymentMethod.mockRejectedValue(new Error("stripe down"));

      const { POST } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: ACADEMY_ID, paymentMethodId: PAYMENT_METHOD_ID }),
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });

  describe("DELETE", () => {
    it("rechaza academyId no UUID con 400", async () => {
      const { DELETE } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: "x" }),
      });
      const response = await DELETE(request);

      expect(response.status).toBe(400);
    });

    it("devuelve 401 sin sesion", async () => {
      const { DELETE } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: ACADEMY_ID }),
      });
      const response = await DELETE(request);

      expect(response.status).toBe(401);
    });

    it("devuelve 403 si el acceso de familia esta denegado", async () => {
      setAuthed();
      accessState.paymentAccess = { allowed: false, reason: "NO_CHILD_IN_ACADEMY" };
      const { DELETE } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: ACADEMY_ID }),
      });
      const response = await DELETE(request);

      expect(response.status).toBe(403);
    });

    it("hace no-op (200) cuando la academia no tiene stripeAccountId", async () => {
      setAuthed();
      accessState.paymentAccess = {
        allowed: true,
        stripeAccountId: undefined,
        connectReady: false,
      };
      const { DELETE } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: ACADEMY_ID }),
      });
      const response = await DELETE(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(serviceMocks.removeDefaultPaymentMethod).not.toHaveBeenCalled();
    });

    it("desvincula la tarjeta cuando hay cuenta Connect activa", async () => {
      setAuthed();
      setPaidAccess();
      serviceMocks.removeDefaultPaymentMethod.mockResolvedValue(undefined);

      const { DELETE } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: ACADEMY_ID }),
      });
      const response = await DELETE(request);

      expect(response.status).toBe(200);
      expect(serviceMocks.removeDefaultPaymentMethod).toHaveBeenCalledWith({
        academyId: ACADEMY_ID,
        profileId: PROFILE_ID,
        stripeAccountId: STRIPE_ACCOUNT_ID,
      });
    });

    it("devuelve 500 si removeDefaultPaymentMethod falla", async () => {
      setAuthed();
      setPaidAccess();
      serviceMocks.removeDefaultPaymentMethod.mockRejectedValue(new Error("stripe down"));

      const { DELETE } = await importPaymentMethod();
      const request = new Request("http://localhost/api/family/payment-method", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: ACADEMY_ID }),
      });
      const response = await DELETE(request);

      expect(response.status).toBe(500);
    });
  });
});

// ---------------------------------------------------------------------------
// /api/family/payment-method/setup-intent
// ---------------------------------------------------------------------------
describe("API /api/family/payment-method/setup-intent", () => {
  it("rechaza body invalido con 400", async () => {
    setAuthed();
    const { POST } = await importSetupIntent();
    const request = new Request("http://localhost/api/family/payment-method/setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ academyId: "nope" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("VALIDATION_ERROR");
  });

  it("devuelve 401 sin usuario", async () => {
    setUnauthed();
    const { POST } = await importSetupIntent();
    const request = new Request("http://localhost/api/family/payment-method/setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ academyId: ACADEMY_ID }),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("devuelve 403 si el perfil no existe", async () => {
    authState.user = { id: USER_ID, email: "parent@example.com" };
    authState.profile = null;
    const { POST } = await importSetupIntent();
    const request = new Request("http://localhost/api/family/payment-method/setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ academyId: ACADEMY_ID }),
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("PROFILE_NOT_FOUND");
  });

  it("devuelve 403 si la familia no tiene hijos en la academia", async () => {
    setAuthed();
    accessState.paymentAccess = { allowed: false, reason: "NO_CHILD_IN_ACADEMY" };
    const { POST } = await importSetupIntent();
    const request = new Request("http://localhost/api/family/payment-method/setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ academyId: ACADEMY_ID }),
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("NO_CHILD_IN_ACADEMY");
  });

  it("devuelve 409 si la academia no esta Connect-ready", async () => {
    setAuthed();
    accessState.paymentAccess = {
      allowed: true,
      stripeAccountId: undefined,
      tenantId: TENANT_ID,
      connectReady: false,
    };
    const { POST } = await importSetupIntent();
    const request = new Request("http://localhost/api/family/payment-method/setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ academyId: ACADEMY_ID }),
    });
    const response = await POST(request);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("ACADEMY_PAYMENTS_NOT_READY");
  });

  it("reusa customer existente y devuelve client_secret + publishableKey", async () => {
    setAuthed();
    setPaidAccess();
    serviceMocks.getOrCreateFamilyCustomer.mockResolvedValue({
      id: "row-1",
      stripeCustomerId: CUSTOMER_ID,
      defaultPaymentMethodId: null,
      cardBrand: null,
      cardLast4: null,
      cardExpMonth: null,
      cardExpYear: null,
    });
    serviceMocks.createFamilySetupIntent.mockResolvedValue("seti_client_secret_xyz");

    const { POST } = await importSetupIntent();
    const request = new Request("http://localhost/api/family/payment-method/setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ academyId: ACADEMY_ID }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(serviceMocks.getOrCreateFamilyCustomer).toHaveBeenCalledWith({
      academyId: ACADEMY_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      stripeAccountId: STRIPE_ACCOUNT_ID,
      email: "parent@example.com",
      name: "Madre Test",
    });
    expect(serviceMocks.createFamilySetupIntent).toHaveBeenCalledWith(CUSTOMER_ID, STRIPE_ACCOUNT_ID);
    const body = await response.json();
    expect(body).toEqual({
      clientSecret: "seti_client_secret_xyz",
      publishableKey: "pk_test_mock",
      stripeAccountId: STRIPE_ACCOUNT_ID,
    });
  });

  it("devuelve 500 cuando createFamilySetupIntent falla", async () => {
    setAuthed();
    setPaidAccess();
    serviceMocks.getOrCreateFamilyCustomer.mockResolvedValue({
      id: "row-1",
      stripeCustomerId: CUSTOMER_ID,
      defaultPaymentMethodId: null,
      cardBrand: null,
      cardLast4: null,
      cardExpMonth: null,
      cardExpYear: null,
    });
    serviceMocks.createFamilySetupIntent.mockRejectedValue(new Error("stripe 500"));

    const { POST } = await importSetupIntent();
    const request = new Request("http://localhost/api/family/payment-method/setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ academyId: ACADEMY_ID }),
    });
    const response = await POST(request);

    expect(response.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// /api/family/charges/[chargeId]/pay
// ---------------------------------------------------------------------------
describe("API /api/family/charges/[chargeId]/pay", () => {
  it("devuelve 401 si no hay sesion", async () => {
    setUnauthed();
    const { POST } = await importChargePay();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/pay`, {
      method: "POST",
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("devuelve 403 si la familia no tiene acceso al cargo", async () => {
    setAuthed();
    accessState.chargeAccess = null;
    const { POST } = await importChargePay();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/pay`, {
      method: "POST",
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("FORBIDDEN");
  });

  it("devuelve 200 con status=paid cuando collectCharge liquida el cargo", async () => {
    setAuthed();
    accessState.chargeAccess = { id: CHARGE_ID, athleteId: ATHLETE_ID };
    serviceMocks.collectCharge.mockResolvedValue({
      ok: true,
      status: "paid",
      paymentIntentId: "pi_1",
    });

    const { POST } = await importChargePay();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/pay`, {
      method: "POST",
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "paid" });
    expect(serviceMocks.collectCharge).toHaveBeenCalledWith(CHARGE_ID);
  });

  it("devuelve 409 con REQUIRES_ACTION si el banco exige SCA", async () => {
    setAuthed();
    accessState.chargeAccess = { id: CHARGE_ID, athleteId: ATHLETE_ID };
    serviceMocks.collectCharge.mockResolvedValue({
      ok: false,
      status: "requires_action",
      paymentIntentId: "pi_2",
    });

    const { POST } = await importChargePay();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/pay`, {
      method: "POST",
    });
    const response = await POST(request);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("REQUIRES_ACTION");
  });

  it("devuelve 409 con reason de skipped cuando no se cobra", async () => {
    setAuthed();
    accessState.chargeAccess = { id: CHARGE_ID, athleteId: ATHLETE_ID };
    serviceMocks.collectCharge.mockResolvedValue({
      ok: false,
      status: "skipped",
      reason: "NO_SAVED_CARD",
    });

    const { POST } = await importChargePay();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/pay`, {
      method: "POST",
    });
    const response = await POST(request);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("NO_SAVED_CARD");
  });

  it("devuelve 402 cuando el cobro falla", async () => {
    setAuthed();
    accessState.chargeAccess = { id: CHARGE_ID, athleteId: ATHLETE_ID };
    serviceMocks.collectCharge.mockResolvedValue({
      ok: false,
      status: "failed",
      reason: "card_declined",
      paymentIntentId: "pi_3",
    });

    const { POST } = await importChargePay();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/pay`, {
      method: "POST",
    });
    const response = await POST(request);

    expect(response.status).toBe(402);
    expect((await response.json()).error).toBe("card_declined");
  });

  it("devuelve 500 si collectCharge lanza una excepcion no controlada", async () => {
    setAuthed();
    accessState.chargeAccess = { id: CHARGE_ID, athleteId: ATHLETE_ID };
    serviceMocks.collectCharge.mockRejectedValue(new Error("db outage"));

    const { POST } = await importChargePay();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/pay`, {
      method: "POST",
    });
    const response = await POST(request);

    expect(response.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// /api/family/charges/[chargeId]/receipt
// ---------------------------------------------------------------------------
describe("API /api/family/charges/[chargeId]/receipt", () => {
  it("devuelve 401 si no hay sesion", async () => {
    setUnauthed();
    const { GET } = await importChargeReceipt();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/receipt`);
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("devuelve 403 si la familia no tiene acceso al cargo", async () => {
    setAuthed();
    accessState.chargeAccess = null;
    const { GET } = await importChargeReceipt();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/receipt`);
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("FORBIDDEN");
  });

  it("devuelve 404 si no hay recibo para ese cargo", async () => {
    setAuthed();
    accessState.chargeAccess = { id: CHARGE_ID, athleteId: ATHLETE_ID };
    dbState.receiptRows = [];

    const { GET } = await importChargeReceipt();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/receipt`);
    const response = await GET(request);

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("RECEIPT_NOT_AVAILABLE");
  });

  it("devuelve 404 si el recibo existe pero no tiene pdfUrl", async () => {
    setAuthed();
    accessState.chargeAccess = { id: CHARGE_ID, athleteId: ATHLETE_ID };
    dbState.receiptRows = [{ pdfUrl: null, receiptNumber: "REC-001" }];

    const { GET } = await importChargeReceipt();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/receipt`);
    const response = await GET(request);

    expect(response.status).toBe(404);
  });

  it("devuelve url y receiptNumber cuando hay recibo con pdfUrl", async () => {
    setAuthed();
    accessState.chargeAccess = { id: CHARGE_ID, athleteId: ATHLETE_ID };
    dbState.receiptRows = [
      { pdfUrl: "https://cdn.example.com/recibo-123.pdf", receiptNumber: "REC-2026-001" },
    ];

    const { GET } = await importChargeReceipt();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/receipt`);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      url: "https://cdn.example.com/recibo-123.pdf",
      receiptNumber: "REC-2026-001",
    });
  });

  it("devuelve 500 si la consulta a la DB falla", async () => {
    setAuthed();
    accessState.chargeAccess = { id: CHARGE_ID, athleteId: ATHLETE_ID };
    // romper el limit devolviendo rejection
    const { db } = await import("@/db");
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error("db down");
    });

    const { GET } = await importChargeReceipt();
    const request = new Request(`http://localhost/api/family/charges/${CHARGE_ID}/receipt`);
    const response = await GET(request);

    expect(response.status).toBe(500);
  });
});
