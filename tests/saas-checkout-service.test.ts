import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  scope: vi.fn(),
  effective: vi.fn(),
  config: vi.fn(),
  lock: vi.fn(),
  provider: vi.fn(),
  select: vi.fn(),
  dbUpdate: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction, select: mocks.select, update: mocks.dbUpdate } }));
vi.mock("@/lib/env", () => ({ getAppUrl: () => "https://example.invalid" }));
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
  mocks.scope.mockReset().mockResolvedValue({ organizationId });
  mocks.effective
    .mockReset()
    .mockResolvedValue({ planCode: "free", source: "free" });
  mocks.lock.mockReset().mockResolvedValue(undefined);
});

describe("Checkout reservation guards with isolated dependencies", () => {
  it("retries the same provider key after session creation succeeds but local saving fails", async () => {
    const operation = { id: "operation", organizationId, planCode: "starter", billingInterval: "month", requestHash,
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
    expect(creations[0][1]).toEqual({ idempotencyKey: "stable-checkout-key" });
    expect(insert).not.toHaveBeenCalled();
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
