import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  scope: vi.fn(),
  liveReady: false,
  effective: vi.fn(),
  config: vi.fn(),
  lock: vi.fn(),
  provider: vi.fn(),
  select: vi.fn(),
  dbUpdate: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction, select: mocks.select, update: mocks.dbUpdate } }));
vi.mock("@/lib/env", () => ({ getAppUrl: () => "https://example.invalid" }));
vi.mock("@/lib/launch/commercial-launch-profile", () => ({
  isSaasCheckoutEnabled: (environment: "test" | "live") =>
    environment === "test" || mocks.liveReady,
  isSaasCheckoutEnabledForMarket: (
    environment: "test" | "live",
    countryCode: string
  ) => environment === "test" || (mocks.liveReady && countryCode === "ES"),
}));
vi.mock("@/modules/saas-billing/application/owner-access", () => ({
  resolveSaasOwnerScope: mocks.scope,
}));
vi.mock("@/modules/saas-billing/application/entitlement-service", () => ({
  resolveEffectiveOrganizationEntitlement: mocks.effective,
  lockOrganizationForSaasMutation: mocks.lock,
}));
vi.mock("@/modules/saas-billing/application/saas-billing-config", () => ({
  getSaasStripeConfig: mocks.config,
  createSaasStripeClient: () => ({
    prices: { retrieve: mocks.provider },
    taxRates: { retrieve: mocks.provider },
    customers: { create: mocks.provider },
    checkout: {
      sessions: { create: mocks.provider, retrieve: mocks.provider },
    },
  }),
  priceForPlan: () => "price_synthetic",
}));
import { createOwnerSaasCheckout } from "@/modules/saas-billing/application/saas-billing-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const at = new Date("2026-10-20T00:00:00Z");
const input = {
  organizationId,
  userId: "synthetic-owner",
  idempotencyKey: "checkout-operation",
  planCode: "starter" as const,
  billingInterval: "month" as const,
  at,
};
const requestHash = createHash("sha256")
  .update(
    JSON.stringify({
      organizationId,
      planCode: "starter",
      billingInterval: "month",
      environment: "test",
      providerAccountReference: "acct_synthetic",
      priceReference: "price_synthetic",
      requestVersion: 2,
    })
  )
  .digest("hex");
const limit = vi.fn();
const insert = vi.fn();
const update = vi.fn();
const tx = {
  select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
  insert,
  update,
};
beforeEach(() => {
  vi.clearAllMocks();
  limit.mockReset();
  mocks.transaction.mockImplementation((fn) => fn(tx));
  mocks.config
    .mockReset()
    .mockReturnValue({
      environment: "test",
      providerAccountReference: "acct_synthetic",
    });
  mocks.scope.mockReset().mockResolvedValue({ organizationId, countryCode: "ES" });
  mocks.liveReady = false;
  mocks.effective
    .mockReset()
    .mockResolvedValue({ planCode: "free", source: "free" });
  mocks.lock.mockReset().mockResolvedValue(undefined);
});

describe("Checkout reservation guards with isolated dependencies", () => {
  it("rejects Live before provider calls or partial database reservations while seller setup is pending", async () => {
    mocks.config.mockReturnValue({ environment: "live", providerAccountReference: "acct_synthetic" });
    await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({
      status: 503, details: { code: "BILLING_CONFIGURATION_UNAVAILABLE" },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
  it.each(["MX", "FR", "ZZ"])(
    "rejects Live checkout for %s before locking or writing even when seller setup is ready",
    async (countryCode) => {
      mocks.liveReady = true;
      mocks.config.mockReturnValue({
        environment: "live",
        providerAccountReference: "acct_synthetic_live",
      });
      mocks.scope.mockResolvedValue({ organizationId, countryCode });

      await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({
        status: 403,
        details: { code: "SAAS_MARKET_NOT_ENABLED" },
      });

      expect(mocks.transaction).toHaveBeenCalledOnce();
      expect(mocks.scope).toHaveBeenCalledOnce();
      expect(mocks.lock).not.toHaveBeenCalled();
      expect(limit).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(mocks.provider).not.toHaveBeenCalled();
      expect(mocks.dbUpdate).not.toHaveBeenCalled();
    }
  );
  it("rechecks the Live country after locking before reserving a Checkout", async () => {
    mocks.liveReady = true;
    // Seller ready for Spain: VAT Tax Rate configured and a covered territory.
    mocks.config.mockReturnValue({
      environment: "live",
      providerAccountReference: "acct_synthetic_live",
      taxRates: { esVatGeneral: "txr_synthetic_live" },
    });
    mocks.scope
      .mockResolvedValueOnce({ organizationId, countryCode: "ES" })
      .mockResolvedValueOnce({ organizationId, countryCode: "MX" });

    await expect(createOwnerSaasCheckout({ ...input, taxTerritory: "peninsula_baleares", immediateStartConsent: true })).rejects.toMatchObject({
      status: 403,
      details: { code: "SAAS_MARKET_NOT_ENABLED" },
    });

    expect(mocks.scope).toHaveBeenCalledTimes(2);
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(limit).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
  it.each([2, 3] as const)("retries v%s with the exact provider body and key after a local save failure", async (requestVersion) => {
    const versionedHash = createHash("sha256").update(JSON.stringify({
      organizationId, planCode: "starter", billingInterval: "month", environment: "test",
      providerAccountReference: "acct_synthetic", priceReference: "price_synthetic", requestVersion,
    })).digest("hex");
    const operation = { id: "operation", organizationId, planCode: "starter", billingInterval: "month", requestHash: versionedHash,
      status: "recovery_required", checkoutSessionReference: null, createdAt: new Date(at.getTime() - 60000),
      stripeIdempotencyKey: "stable-checkout-key", leaseToken: "lease", fencingVersion: 2 };
    limit.mockResolvedValue([operation]);
    update.mockReturnValue({ set: () => ({ where: () => ({ returning: async () => [operation] }) }) });
    const customerKey = `zaltyko-saas-customer-${organizationId}-test-${createHash("sha256").update("acct_synthetic").digest("hex").slice(0, 8)}`;
    const customerHash = createHash("sha256").update(JSON.stringify({ organizationId, environment: "test", providerAccountReference: "acct_synthetic" })).digest("hex");
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{
      id: "customer-row", status: "ready", customerReference: "cus_saved",
      creationIdempotencyKey: customerKey, creationRequestHash: customerHash,
    }] }) }) });
    const price = { id: "price_synthetic", active: true, livemode: false, currency: "eur", type: "recurring", recurring: { interval: "month", interval_count: 1 }, unit_amount: 1900 };
    const session = { id: "cs_same", mode: "subscription", status: "open", customer: "cus_saved", livemode: false,
      expires_at: 4070908800, url: "https://checkout.stripe.com/c/pay/synthetic",
      metadata: { zaltyko_saas: "true", organization_saas_checkout_operation_id: "operation", organization_id: organizationId,
        plan_code: "starter", billing_interval: "month", provider_account_reference: "acct_synthetic", environment: "test" },
      line_items: { data: [{ quantity: 1, price }] } };
    mocks.provider.mockImplementation(async (arg) => typeof arg === "string"
      ? arg === "price_synthetic" ? price : session : { id: session.id });
    let saves = 0;
    mocks.dbUpdate.mockReturnValue({ set: (data: { status: string }) => ({ where: () => data.status === "open"
      ? { returning: async () => { if (++saves === 1) throw new Error("synthetic DB write failure"); return [{ id: operation.id }]; } }
      : Promise.resolve() }) });
    await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 503 });
    expect(saves).toBe(1);
    await expect(createOwnerSaasCheckout(input)).resolves.toMatchObject({ operationId: "operation", replayed: true });
    const creations = mocks.provider.mock.calls.filter(([arg]) => typeof arg === "object");
    expect(creations).toHaveLength(2);
    expect(creations[0]).toEqual(creations[1]);
    expect(creations[0][0]).toMatchObject({
      integration_identifier: expect.stringMatching(/^zaltyko_saas_[a-z]{8}$/),
    });
    if (requestVersion === 3) {
      expect(creations[0][0]).toHaveProperty("adaptive_pricing", { enabled: false });
    } else {
      expect(creations[0][0]).not.toHaveProperty("adaptive_pricing");
    }
    expect(creations[0][1]).toEqual({ idempotencyKey: "stable-checkout-key" });
    expect(insert).not.toHaveBeenCalled();
  });
  it.each([
    ["canarias", 403, "SAAS_TAX_TERRITORY_NOT_COVERED"],
    ["ceuta", 403, "SAAS_TAX_TERRITORY_NOT_COVERED"],
    ["melilla", 403, "SAAS_TAX_TERRITORY_NOT_COVERED"],
    [undefined, 422, "SAAS_TAX_TERRITORY_REQUIRED"],
  ] as const)("rejects Spanish Live checkout for territory %s before locking or writing", async (taxTerritory, status, code) => {
    mocks.liveReady = true;
    mocks.config.mockReturnValue({
      environment: "live",
      providerAccountReference: "acct_synthetic_live",
      taxRates: { esVatGeneral: "txr_synthetic_live" },
    });
    await expect(createOwnerSaasCheckout({ ...input, taxTerritory })).rejects.toMatchObject({
      status, details: { code },
    });
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
  it.each([undefined, false])("requires the immediate-start consent (%s) before locking or writing", async (immediateStartConsent) => {
    mocks.liveReady = true;
    mocks.config.mockReturnValue({
      environment: "live",
      providerAccountReference: "acct_synthetic_live",
      taxRates: { esVatGeneral: "txr_synthetic_live" },
    });
    await expect(createOwnerSaasCheckout({
      ...input, taxTerritory: "peninsula_baleares", immediateStartConsent,
    })).rejects.toMatchObject({
      status: 422, details: { code: "SAAS_IMMEDIATE_START_CONSENT_REQUIRED" },
    });
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
  it("keeps Spanish Live checkout closed without the VAT Tax Rate even when seller setup is ready", async () => {
    mocks.liveReady = true;
    mocks.config.mockReturnValue({ environment: "live", providerAccountReference: "acct_synthetic_live" });
    await expect(createOwnerSaasCheckout({ ...input, taxTerritory: "peninsula_baleares", immediateStartConsent: true })).rejects.toMatchObject({
      status: 503, details: { code: "BILLING_CONFIGURATION_UNAVAILABLE" },
    });
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  describe("Spanish VAT on a new Checkout session", () => {
    const v3Hash = createHash("sha256").update(JSON.stringify({
      organizationId, planCode: "starter", billingInterval: "month", environment: "test",
      providerAccountReference: "acct_synthetic", priceReference: "price_synthetic", requestVersion: 3,
    })).digest("hex");
    const operation = { id: "operation", organizationId, planCode: "starter", billingInterval: "month", requestHash: v3Hash,
      status: "recovery_required", checkoutSessionReference: null, createdAt: new Date(at.getTime() - 60000),
      stripeIdempotencyKey: "stable-checkout-key", leaseToken: "lease", fencingVersion: 2 };
    const price = { id: "price_synthetic", active: true, livemode: false, currency: "eur", type: "recurring", recurring: { interval: "month", interval_count: 1 }, unit_amount: 1900 };
    const taxRate = { id: "txr_synthetic", active: true, livemode: false, inclusive: false, percentage: 21, country: "ES", tax_type: "vat" };
    const session = { id: "cs_taxed", mode: "subscription", status: "open", customer: "cus_saved", livemode: false,
      expires_at: 4070908800, url: "https://checkout.stripe.com/c/pay/synthetic",
      amount_subtotal: 1900, amount_total: 2299, total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 399 },
      metadata: { zaltyko_saas: "true", organization_saas_checkout_operation_id: "operation", organization_id: organizationId,
        plan_code: "starter", billing_interval: "month", provider_account_reference: "acct_synthetic", environment: "test" },
      line_items: { data: [{ quantity: 1, price }] } };
    function arrange(overrides: { session?: Record<string, unknown>; taxRate?: Record<string, unknown> } = {}) {
      mocks.config.mockReturnValue({
        environment: "test", providerAccountReference: "acct_synthetic",
        taxRates: { esVatGeneral: "txr_synthetic" },
      });
      limit.mockResolvedValue([operation]);
      update.mockReturnValue({ set: () => ({ where: () => ({ returning: async () => [operation] }) }) });
      const customerKey = `zaltyko-saas-customer-${organizationId}-test-${createHash("sha256").update("acct_synthetic").digest("hex").slice(0, 8)}`;
      const customerHash = createHash("sha256").update(JSON.stringify({ organizationId, environment: "test", providerAccountReference: "acct_synthetic" })).digest("hex");
      mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{
        id: "customer-row", status: "ready", customerReference: "cus_saved",
        creationIdempotencyKey: customerKey, creationRequestHash: customerHash,
      }] }) }) });
      mocks.provider.mockImplementation(async (arg) => typeof arg === "string"
        ? arg === "price_synthetic" ? price
          : arg === "txr_synthetic" ? { ...taxRate, ...overrides.taxRate }
            : { ...session, ...overrides.session }
        : { id: session.id });
      mocks.dbUpdate.mockReturnValue({ set: (data: { status: string }) => ({ where: () => data.status === "open"
        ? { returning: async () => [{ id: operation.id }] }
        : Promise.resolve() }) });
    }
    it("adds the 21 % Tax Rate and invoice data collection, and checks the session total", async () => {
      arrange();
      await expect(createOwnerSaasCheckout({ ...input, taxTerritory: "peninsula_baleares", immediateStartConsent: true }))
        .resolves.toMatchObject({ operationId: "operation", checkoutUrl: "https://checkout.stripe.com/c/pay/synthetic" });
      expect(mocks.provider).toHaveBeenCalledWith("txr_synthetic");
      const creations = mocks.provider.mock.calls.filter(([arg]) => typeof arg === "object");
      expect(creations).toHaveLength(1);
      expect(creations[0][0]).toMatchObject({
        line_items: [{ price: "price_synthetic", quantity: 1, tax_rates: ["txr_synthetic"] }],
        billing_address_collection: "required",
        tax_id_collection: { enabled: true, required: "if_supported" },
        name_collection: { business: { enabled: true, optional: false } },
        customer: "cus_saved",
        customer_update: { address: "auto", name: "auto" },
        metadata: {
          zaltyko_plan: "starter", zaltyko_academy_id: organizationId,
          immediate_start_consent: "desistimiento-14d-v1",
        },
        subscription_data: { metadata: {
          zaltyko_plan: "starter", zaltyko_academy_id: organizationId,
          immediate_start_consent: "desistimiento-14d-v1",
        } },
      });
      // Con `customer` no se puede usar customer_email: Checkout fija el email en el Customer.
      expect(creations[0][0]).not.toHaveProperty("customer_email");
      // Moneda fija: sin conversión local de Checkout y precio validado en EUR.
      expect(creations[0][0]).toHaveProperty("adaptive_pricing", { enabled: false });
      // Las facturas se emiten en FacturaDirecta (serie ZA), no en Stripe.
      expect(creations[0][0]).not.toHaveProperty("invoice_creation");
      expect(creations[0][0]).not.toHaveProperty("automatic_tax");
      expect(creations[0][1]).toEqual({ idempotencyKey: "stable-checkout-key" });
    });
    it.each([
      ["a session without tax", { amount_total: 1900, total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 } }],
      ["a session with another tax amount", { amount_total: 2280, total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 380 } }],
    ])("does not hand over %s", async (_label, sessionOverride) => {
      arrange({ session: sessionOverride });
      await expect(createOwnerSaasCheckout({ ...input, taxTerritory: "peninsula_baleares", immediateStartConsent: true }))
        .rejects.toMatchObject({ status: 503 });
    });
    it("refuses a non-EUR price before creating a taxed session", async () => {
      arrange();
      const usd = { ...price, currency: "usd" };
      const base = mocks.provider.getMockImplementation()!;
      mocks.provider.mockImplementation(async (arg) => arg === "price_synthetic" ? usd : base(arg));
      await expect(createOwnerSaasCheckout({ ...input, taxTerritory: "peninsula_baleares", immediateStartConsent: true }))
        .rejects.toMatchObject({ status: 503 });
      expect(mocks.provider.mock.calls.filter(([arg]) => typeof arg === "object")).toHaveLength(0);
    });
    it("keeps untaxed test sessions free of tax and invoicing parameters", async () => {
      arrange();
      mocks.config.mockReturnValue({ environment: "test", providerAccountReference: "acct_synthetic" });
      mocks.provider.mockImplementation(async (arg) => typeof arg === "string"
        ? arg === "price_synthetic" ? price
          : { ...session, amount_subtotal: 1900, amount_total: 1900, total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 } }
        : { id: session.id });
      await expect(createOwnerSaasCheckout(input)).resolves.toMatchObject({ operationId: "operation" });
      const creations = mocks.provider.mock.calls.filter(([arg]) => typeof arg === "object");
      expect(creations).toHaveLength(1);
      for (const key of ["zaltyko_plan", "zaltyko_academy_id", "immediate_start_consent"]) {
        expect(creations[0][0].metadata).not.toHaveProperty(key);
      }
      expect(creations[0][0]).not.toHaveProperty("tax_id_collection");
      expect(creations[0][0].line_items[0]).not.toHaveProperty("tax_rates");
    });
    it.each([
      ["inclusive", { inclusive: true }],
      ["10 %", { percentage: 10 }],
      ["another country", { country: "PT" }],
      ["archived", { active: false }],
      ["live mode", { livemode: true }],
    ])("refuses a misconfigured Tax Rate (%s) before creating a session", async (_label, taxRateOverride) => {
      arrange({ taxRate: taxRateOverride });
      await expect(createOwnerSaasCheckout({ ...input, taxTerritory: "peninsula_baleares", immediateStartConsent: true }))
        .rejects.toMatchObject({ status: 503 });
      expect(mocks.provider.mock.calls.filter(([arg]) => typeof arg === "object")).toHaveLength(0);
    });
  });
  it("reuses the validated open session without creating another operation", async () => {
    const expiresAt = new Date("2099-01-01T00:00:00Z");
    limit.mockResolvedValueOnce([{ id: "operation", organizationId, planCode: "starter", billingInterval: "month", requestHash, status: "open", checkoutSessionReference: "cs_saved", sessionExpiresAt: expiresAt, customerId: "customer-row" }]);
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ customerReference: "cus_saved" }] }) }) });
    mocks.provider.mockResolvedValue({
      id: "cs_saved", mode: "subscription", status: "open", customer: "cus_saved", livemode: false,
      expires_at: expiresAt.getTime() / 1000, url: "https://checkout.stripe.com/c/pay/synthetic",
      metadata: { zaltyko_saas: "true", organization_saas_checkout_operation_id: "operation", organization_id: organizationId, plan_code: "starter", billing_interval: "month", provider_account_reference: "acct_synthetic", environment: "test" },
      line_items: { data: [{ quantity: 1, price: { id: "price_synthetic", active: true, livemode: false, currency: "eur", type: "recurring", recurring: { interval: "month", interval_count: 1 }, unit_amount: 1900 } }] },
    });
    await expect(createOwnerSaasCheckout(input)).resolves.toEqual({ operationId: "operation", checkoutUrl: "https://checkout.stripe.com/c/pay/synthetic", expiresAt, status: "pending", replayed: true });
    expect(mocks.provider).toHaveBeenCalledExactlyOnceWith("cs_saved", { expand: ["line_items.data.price"] });
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects a reused key with a different payload before provider calls", async () => {
    limit.mockResolvedValueOnce([{ requestHash: "different" }]);
    await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it.each(["completed", "expired", "failed"])(
    "does not revive terminal operation %s",
    async (status) => {
      limit.mockResolvedValueOnce([{ id: "operation", requestHash, status }]);
      await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({
        status: 409,
      });
      expect(update).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
      expect(mocks.provider).not.toHaveBeenCalled();
    }
  );
  it.each(["creating_customer", "creating_session"])(
    "does not steal a live %s lease",
    async (status) => {
      limit.mockResolvedValueOnce([
        {
          id: "operation",
          requestHash,
          status,
          leaseUntil: new Date(at.getTime() + 1),
        },
      ]);
      await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({
        status: 409,
        details: { code: "CHECKOUT_IN_PROGRESS" },
      });
      expect(update).not.toHaveBeenCalled();
      expect(mocks.provider).not.toHaveBeenCalled();
    }
  );
  it.each([23 * 3600000, -1])("refuses unsafe recovery age %s", async (age) => {
    limit.mockResolvedValueOnce([
      {
        id: "operation",
        requestHash,
        status: "recovery_required",
        createdAt: new Date(at.getTime() - age),
      },
    ]);
    await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({
      status: 409,
    });
    expect(update).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("rejects a new Checkout for an already paid entitlement", async () => {
    limit.mockResolvedValueOnce([]);
    mocks.effective.mockResolvedValue({
      planCode: "growth",
      source: "stripe_subscription",
    });
    await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({
      status: 409,
      details: { code: "SUBSCRIPTION_ALREADY_EXISTS" },
    });
    expect(insert).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
});
