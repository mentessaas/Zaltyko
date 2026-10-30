import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), scope: vi.fn(), config: vi.fn(), retrieve: vi.fn(),
  createSession: vi.fn(), createCustomer: vi.fn(), insert: vi.fn(), update: vi.fn(),
  remove: vi.fn(), limit: vi.fn(), where: vi.fn(), priceForPlan: vi.fn(),
}));
vi.mock("@/db", () => ({ db: {
  transaction: mocks.transaction, insert: mocks.insert, update: mocks.update, delete: mocks.remove,
} }));
vi.mock("@/lib/env", () => ({ getAppUrl: () => "https://example.invalid", getDatabaseUrl: () => "" }));
vi.mock("@/modules/saas-billing/application/owner-access", () => ({ resolveSaasOwnerScope: mocks.scope }));
vi.mock("@/modules/saas-billing/application/entitlement-service", () => ({
  resolveEffectiveOrganizationEntitlement: vi.fn(), grantOrganizationEntitlement: vi.fn(),
  lockOrganizationForSaasMutation: vi.fn(),
}));
vi.mock("@/modules/saas-billing/application/saas-billing-config", () => ({
  getSaasStripeConfig: mocks.config,
  createSaasStripeClient: () => ({
    customers: { create: mocks.createCustomer },
    checkout: { sessions: { retrieve: mocks.retrieve, create: mocks.createSession } },
  }),
  priceForPlan: mocks.priceForPlan,
}));

import { recoverOwnerSaasCheckout } from "@/modules/saas-billing/application/saas-billing-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const input = { organizationId, userId: "synthetic-owner" };
const now = new Date("2026-10-30T10:00:00Z");
const expiresAt = new Date("2026-10-30T11:00:00Z");
function operation() {
  return {
    id: "synthetic-operation", organizationId, customerId: "synthetic-customer-row",
    environment: "test", providerAccountReference: "acct_synthetic", status: "open",
    planCode: "starter", billingInterval: "month", requestHash: "synthetic-original-hash",
    checkoutSessionReference: "cs_test_saved", sessionExpiresAt: expiresAt,
  };
}
function session() {
  return {
    id: "cs_test_saved", mode: "subscription", status: "open", livemode: false,
    customer: "cus_saved", expires_at: expiresAt.getTime() / 1000,
    url: "https://checkout.stripe.com/c/pay/synthetic",
    metadata: {
      zaltyko_saas: "true", organization_saas_checkout_operation_id: "synthetic-operation",
      organization_id: organizationId, plan_code: "starter", billing_interval: "month",
      provider_account_reference: "acct_synthetic", environment: "test",
    },
    line_items: { data: [{ quantity: 1, price: {
      id: "price_synthetic", active: true, livemode: false, currency: "eur", type: "recurring",
      recurring: { interval: "month", interval_count: 1 }, unit_amount: 1900,
    } }] },
  };
}
const tx = {
  select: () => ({ from: () => ({ where: mocks.where }) }),
  insert: mocks.insert, update: mocks.update, delete: mocks.remove,
};
function queueTarget(op = operation()) {
  mocks.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([op])
    .mockResolvedValueOnce([{ customerReference: "cus_saved" }]);
}
function unchangedTarget() { queueTarget(); queueTarget(); }
function expectNoWrites() {
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.createSession).not.toHaveBeenCalled();
  expect(mocks.createCustomer).not.toHaveBeenCalled();
}
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  vi.useFakeTimers(); vi.setSystemTime(now);
  mocks.transaction.mockImplementation(fn => fn(tx));
  mocks.where.mockImplementation(() => ({ limit: mocks.limit }));
  mocks.scope.mockResolvedValue({ organizationId });
  mocks.config.mockReturnValue({ environment: "test", providerAccountReference: "acct_synthetic" });
  mocks.priceForPlan.mockReturnValue("price_synthetic");
  mocks.retrieve.mockResolvedValue(session());
});
afterEach(() => { expectNoWrites(); vi.useRealTimers(); });

describe("existing Checkout recovery is read-only and scope-bound", () => {
  it("retrieves the same session, validates it and rechecks scope before returning its URL", async () => {
    unchangedTarget();
    await expect(recoverOwnerSaasCheckout(input)).resolves.toEqual({
      operationId: "synthetic-operation", checkoutUrl: "https://checkout.stripe.com/c/pay/synthetic",
      expiresAt, status: "pending",
    });
    expect(mocks.retrieve).toHaveBeenCalledExactlyOnceWith("cs_test_saved", { expand: ["line_items.data.price"] });
    expect(mocks.scope).toHaveBeenCalledTimes(3);
    expect(mocks.scope).toHaveBeenNthCalledWith(1, input);
    expect(mocks.scope).toHaveBeenNthCalledWith(2, { ...input, tx });
    expect(mocks.scope).toHaveBeenNthCalledWith(3, { ...input, tx });
    const queries = mocks.where.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query as SQL));
    for (const query of queries) {
      expect(query.params).toContain(organizationId);
      expect(query.params).toContain("test");
      expect(query.params).toContain("acct_synthetic");
    }
    expect(queries.filter(query => query.params.includes("open"))).toHaveLength(2);
    expect(queries.filter(query => query.params.includes("ready"))).toHaveLength(2);
  });

  it("rejects an unauthorized Owner/manager before reading the database or Stripe", async () => {
    mocks.scope.mockRejectedValue(new OperationalError("FORBIDDEN", "No autorizado", 403));
    await expect(recoverOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 403 });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it("does not touch the frozen natural-expiry organizations", async () => {
    mocks.scope.mockResolvedValue({ organizationId: "8d096bf6-4947-4815-b5bc-5741e0e1661f" });
    await expect(recoverOwnerSaasCheckout(input)).resolves.toBeNull();
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it("fails closed without billing configuration", async () => {
    mocks.config.mockReturnValue(null);
    await expect(recoverOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 503 });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it("does not create a replacement session when retrieve fails", async () => {
    queueTarget(); mocks.retrieve.mockRejectedValue(new Error("synthetic provider unavailable"));
    await expect(recoverOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 503 });
    expect(mocks.retrieve).toHaveBeenCalledOnce();
  });
  it("returns no link without a ready customer in the same scope", async () => {
    mocks.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([operation()]).mockResolvedValueOnce([]);
    await expect(recoverOwnerSaasCheckout(input)).resolves.toBeNull();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it("returns no link when provider and database expiry differ", async () => {
    queueTarget(); mocks.retrieve.mockResolvedValue({ ...session(), expires_at: expiresAt.getTime() / 1000 + 60 });
    await expect(recoverOwnerSaasCheckout(input)).resolves.toBeNull();
  });
  it("returns no link for a quarantined event without calling Stripe", async () => {
    mocks.limit.mockResolvedValueOnce([{ id: "quarantined-event" }]);
    await expect(recoverOwnerSaasCheckout(input)).resolves.toBeNull();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it("returns no link when there is no unique open operation", async () => {
    mocks.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([operation(), { ...operation(), id: "other" }]);
    await expect(recoverOwnerSaasCheckout(input)).resolves.toBeNull();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it("does not retrieve an operation already expired locally", async () => {
    mocks.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...operation(), sessionExpiresAt: now }]);
    await expect(recoverOwnerSaasCheckout(input)).resolves.toBeNull();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it.each(["complete", "expired"])("does not expose a provider session in status %s", async status => {
    queueTarget(); mocks.retrieve.mockResolvedValue({ ...session(), status });
    await expect(recoverOwnerSaasCheckout(input)).resolves.toBeNull();
  });
  it("does not expose a provider session that expired before retrieval", async () => {
    queueTarget(); mocks.retrieve.mockResolvedValue({ ...session(), expires_at: now.getTime() / 1000 });
    await expect(recoverOwnerSaasCheckout(input)).resolves.toBeNull();
  });
  it.each([
    ["customer", { customer: "cus_other" }], ["session", { id: "cs_test_other" }],
    ["mode", { mode: "payment" }], ["environment", { livemode: true }],
  ])("rejects a mismatched provider %s", async (_label, change) => {
    queueTarget(); mocks.retrieve.mockResolvedValue({ ...session(), ...change });
    await expect(recoverOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 503 });
  });
  it.each([
    ["organization_id", "other-org"], ["organization_saas_checkout_operation_id", "other-operation"],
    ["provider_account_reference", "acct_other"], ["environment", "live"],
  ])("rejects mismatched %s metadata", async (field, value) => {
    queueTarget(); const saved = session(); saved.metadata = { ...saved.metadata, [field]: value };
    mocks.retrieve.mockResolvedValue(saved);
    await expect(recoverOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 503 });
  });
  it.each([
    ["id", "price_other"], ["currency", "usd"], ["unit_amount", 4900], ["livemode", true],
  ])("rejects a changed price %s", async (field, value) => {
    queueTarget(); const saved = session();
    saved.line_items.data[0]!.price = { ...saved.line_items.data[0]!.price, [field]: value };
    mocks.retrieve.mockResolvedValue(saved);
    await expect(recoverOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 503 });
  });
  it.each([
    "https://checkout.stripe.com.example.test/c/pay/synthetic",
    "https://checkout.stripe.com:444/c/pay/synthetic",
    "https://synthetic-user@checkout.stripe.com/c/pay/synthetic",
    "https://synthetic-user:synthetic-password@checkout.stripe.com/c/pay/synthetic",
  ])("rejects a deceptive or credential-bearing URL %s", async url => {
    unchangedTarget(); mocks.retrieve.mockResolvedValue({ ...session(), url });
    await expect(recoverOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 503 });
  });
  it("returns no link if quarantine appears while Stripe is being read", async () => {
    queueTarget(); mocks.limit.mockResolvedValueOnce([{ id: "new-quarantine" }]);
    await expect(recoverOwnerSaasCheckout(input)).resolves.toBeNull();
    expect(mocks.retrieve).toHaveBeenCalledOnce();
  });
  it("returns no link if the operation changes during retrieval", async () => {
    queueTarget(); queueTarget({ ...operation(), requestHash: "changed-hash" });
    await expect(recoverOwnerSaasCheckout(input)).resolves.toBeNull();
  });
  it("returns no link if reconciliation closes the open operation", async () => {
    queueTarget(); mocks.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(recoverOwnerSaasCheckout(input)).resolves.toBeNull();
  });
  it("rechecks permissions after retrieval and does not leak the URL after revocation", async () => {
    queueTarget(); mocks.scope.mockResolvedValueOnce({ organizationId }).mockResolvedValueOnce({ organizationId })
      .mockRejectedValueOnce(new OperationalError("FORBIDDEN", "No autorizado", 403));
    await expect(recoverOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 403 });
    expect(mocks.retrieve).toHaveBeenCalledOnce();
  });
});
