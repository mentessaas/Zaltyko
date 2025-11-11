import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let STATUS_POST: typeof import("@/app/api/billing/status/route").POST;
let HISTORY_POST: typeof import("@/app/api/billing/history/route").POST;
let SYNC_POST: typeof import("@/app/api/billing/sync/route").POST;
let CHECKOUT_POST: typeof import("@/app/api/billing/checkout/route").POST;

const originalEnv = { ...process.env };
const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";

let selectQueue: any[] = [];
let insertCalls: Array<{ table: unknown; payload: unknown }> = [];
let updateCalls: Array<{ table: unknown; values: unknown }> = [];

let getActiveSubscription: ReturnType<typeof vi.fn>;
let syncStripePlans: ReturnType<typeof vi.fn>;
let getStripeClient: ReturnType<typeof vi.fn>;
let stripeClientMock: {
  customers: { create: ReturnType<typeof vi.fn> };
  checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
};

const createSelectChain = (finalMethod: "where" | "orderBy" | "limit", result: any) => {
  const chain: Record<string, any> = {};
  const methods = ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"] as const;

  methods.forEach((method) => {
    if (method === finalMethod) {
      chain[method] = vi.fn(() => Promise.resolve(result));
    } else {
      chain[method] = vi.fn(() => chain);
    }
  });

  return chain;
};

describe("API Billing", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };
    selectQueue = [];
    insertCalls = [];
    updateCalls = [];

    vi.mock("@/lib/authz", () => ({
      withTenant:
        (handler: (request: Request, context: any) => Promise<Response>) =>
        (request: Request, ctx: any = {}) =>
          handler(request, {
            tenantId: "tenant-123",
            userId: "user-123",
            profile: { id: "profile-1", role: "admin", tenantId: "tenant-123" },
            ...ctx,
          }),
    }));

    vi.mock("@/lib/limits", () => ({
      getActiveSubscription: vi.fn(),
    }));
    const limitsModule = await import("@/lib/limits");
    getActiveSubscription = limitsModule.getActiveSubscription as unknown as ReturnType<
      typeof vi.fn
    >;
    getActiveSubscription.mockResolvedValue({
      planCode: "free",
      athleteLimit: 50,
      classLimit: 10,
    });

    vi.mock("@/lib/stripe/sync-plans", () => ({
      syncStripePlans: vi.fn().mockResolvedValue({
        updatedPlanCodes: ["pro"],
        archivedPlanCodes: [],
        missingStripePrices: [],
      }),
    }));
    const syncModule = await import("@/lib/stripe/sync-plans");
    syncStripePlans = syncModule.syncStripePlans as unknown as ReturnType<typeof vi.fn>;

    stripeClientMock = {
      customers: {
        create: vi.fn(),
      },
      checkout: {
        sessions: {
          create: vi.fn(),
        },
      },
    };
    vi.mock("@/lib/stripe/client", () => ({
      getStripeClient: vi.fn(() => stripeClientMock),
    }));
    const stripeClientModule = await import("@/lib/stripe/client");
    getStripeClient = stripeClientModule.getStripeClient as unknown as ReturnType<typeof vi.fn>;

    vi.mock("@/db", () => ({
      db: {
        insert: vi.fn((table) => ({
          values: (payload: unknown) => {
            insertCalls.push({ table, payload });
            return {
              onConflictDoUpdate: vi.fn().mockReturnValue(Promise.resolve(undefined)),
              returning: vi.fn().mockResolvedValue([]),
            };
          },
        })),
        select: vi.fn(() => {
          const chain = selectQueue.shift();
          if (!chain) {
            throw new Error("Select queue exhausted");
          }
          return chain;
        }),
        update: vi.fn((table) => ({
          set: (values: unknown) => {
            updateCalls.push({ table, values });
            return {
              where: vi.fn(() => Promise.resolve(undefined)),
            };
          },
        })),
      },
    }));

    STATUS_POST = (await import("@/app/api/billing/status/route")).POST;
    HISTORY_POST = (await import("@/app/api/billing/history/route")).POST;
    SYNC_POST = (await import("@/app/api/billing/sync/route")).POST;
    CHECKOUT_POST = (await import("@/app/api/billing/checkout/route")).POST;
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("devuelve el estado de facturación de una academia", async () => {
    selectQueue.push(
      createSelectChain("limit", [
        {
          tenantId: "tenant-123",
          stripeCustomerId: "cus_123",
          planCode: "pro",
          status: "active",
        },
      ])
    );
    getActiveSubscription.mockResolvedValue({
      planCode: "pro",
      athleteLimit: 200,
      classLimit: 40,
    });

    const request = new Request("http://localhost/api/billing/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ academyId: ACADEMY_ID }),
    });

    const response = await STATUS_POST(request, {} as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      planCode: "pro",
      status: "active",
      athleteLimit: 200,
      classLimit: 40,
      hasStripeCustomer: true,
    });
  });

  it("lista el historial de facturas de una academia", async () => {
    selectQueue.push(
      createSelectChain("limit", [
        {
          tenantId: "tenant-123",
        },
      ])
    );
    selectQueue.push(
      createSelectChain("limit", [
        {
          id: "invoice-1",
          status: "paid",
          amountDue: 1900,
          amountPaid: 1900,
          currency: "eur",
          billingReason: "subscription_create",
          hostedInvoiceUrl: "https://stripe.test/invoice",
          invoicePdf: "https://stripe.test/invoice.pdf",
          stripeInvoiceId: "in_123",
        },
      ])
    );

    const request = new Request("http://localhost/api/billing/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ academyId: ACADEMY_ID }),
    });

    const response = await HISTORY_POST(request, {} as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "invoice-1",
      status: "paid",
    });
  });

  it("solo permite sincronizar planes a super admin", async () => {
    const requestForbidden = new Request("http://localhost/api/billing/sync", { method: "POST" });
    const forbidden = await SYNC_POST(requestForbidden, {} as any);
    expect(forbidden.status).toBe(403);

    const requestAllowed = new Request("http://localhost/api/billing/sync", { method: "POST" });
    const allowed = await SYNC_POST(
      requestAllowed,
      { profile: { role: "super_admin" }, tenantId: "tenant-123" } as any
    );
    expect(allowed.status).toBe(200);
    const body = await allowed.json();
    expect(body.updatedPlanCodes).toEqual(["pro"]);
    expect(syncStripePlans).toHaveBeenCalled();
  });

  it("no inicia checkout si falta STRIPE_SECRET_KEY", async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const request = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        academyId: ACADEMY_ID,
        planCode: "pro",
      }),
    });

    const response = await CHECKOUT_POST(request, {} as any);
    expect(response.status).toBe(500);
  });

  it("crea una sesión de checkout para suscripción", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    stripeClientMock.customers.create.mockResolvedValue({ id: "cus_new" });
    stripeClientMock.checkout.sessions.create.mockResolvedValue({
      url: "https://stripe.test/checkout",
    });

    selectQueue.push(
      createSelectChain("limit", [
        {
          tenantId: "tenant-123",
          name: "Gymna Training Center",
          stripeCustomerId: null,
        },
      ])
    );
    selectQueue.push(
      createSelectChain("limit", [
        {
          id: "plan-123",
          stripePriceId: "price_123",
        },
      ])
    );

    const request = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        academyId: ACADEMY_ID,
        planCode: "pro",
      }),
    });

    const response = await CHECKOUT_POST(request, {} as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.checkoutUrl).toBe("https://stripe.test/checkout");
    expect(stripeClientMock.customers.create).toHaveBeenCalledWith({
      name: "Gymna Training Center",
      metadata: {
        academyId: ACADEMY_ID,
        tenantId: "tenant-123",
      },
    });
    expect(updateCalls).toHaveLength(1);
    expect(stripeClientMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_new",
        line_items: [
          {
            price: "price_123",
            quantity: 1,
          },
        ],
      })
    );
  });

  it("rechaza checkout si el plan no tiene price", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";

    selectQueue.push(
      createSelectChain("limit", [
        {
          tenantId: "tenant-123",
          name: "Gymna Training Center",
          stripeCustomerId: "cus_123",
        },
      ])
    );
    selectQueue.push(createSelectChain("limit", []));

    const request = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        academyId: ACADEMY_ID,
        planCode: "premium",
      }),
    });

    const response = await CHECKOUT_POST(request, {} as any);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("PLAN_NOT_AVAILABLE");
  });
});


