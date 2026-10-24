import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), select: vi.fn(), update: vi.fn(),
  scope: vi.fn(), effective: vi.fn(), lock: vi.fn(), config: vi.fn(),
  price: vi.fn(), customer: vi.fn(), create: vi.fn(), retrieve: vi.fn(),
  appUrl: vi.fn(), databaseUrl: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction, select: mocks.select, update: mocks.update } }));
vi.mock("@/lib/env", () => ({ getAppUrl: mocks.appUrl, getDatabaseUrl: mocks.databaseUrl }));
vi.mock("@/modules/saas-billing/application/owner-access", () => ({ resolveSaasOwnerScope: mocks.scope }));
vi.mock("@/modules/saas-billing/application/entitlement-service", () => ({
  resolveEffectiveOrganizationEntitlement: mocks.effective, lockOrganizationForSaasMutation: mocks.lock,
}));
vi.mock("@/modules/saas-billing/application/saas-billing-config", () => ({
  getSaasStripeConfig: mocks.config,
  createSaasStripeClient: () => ({ prices: { retrieve: mocks.price }, customers: { create: mocks.customer },
    checkout: { sessions: { create: mocks.create, retrieve: mocks.retrieve } } }),
  priceForPlan: () => "price_synthetic",
}));

import { createOwnerSaasCheckout } from "@/modules/saas-billing/application/saas-billing-service";
import {
  resolveShortPaidCheckoutEnvelope, shortPaidStripeIdempotencyKey, SHORT_PAID_QA_ORGANIZATIONS,
  SHORT_PAID_QA_RUN, type ShortPaidCheckoutOperation,
} from "@/modules/saas-billing/application/short-paid-checkout-envelope";

const createdAt = new Date("2026-10-21T19:00:00Z");
const qaOrg = SHORT_PAID_QA_ORGANIZATIONS[0];
const normalOrg = "10000000-0000-4000-8000-000000000001";
const databaseUrl = "postgresql://synthetic:synthetic@db.aeeootdmuiqkfeernskw.supabase.co:5432/postgres";
const config = { environment: "test", providerAccountReference: "acct_1STR6eDXXopppUpe" } as const;
const input = { userId: "synthetic-owner", organizationId: qaOrg, planCode: "starter" as const,
  billingInterval: "month" as const, idempotencyKey: "synthetic-short-paid" };
const price = { id: "price_synthetic", active: true, livemode: false, currency: "eur", type: "recurring",
  recurring: { interval: "month", interval_count: 1 }, unit_amount: 1900 };
type Operation = ShortPaidCheckoutOperation & {
  status: string; checkoutSessionReference: string | null; sessionExpiresAt: Date | null;
  customerId: string | null; leaseToken: string | null; leaseUntil: Date | null; fencingVersion: number;
};
let operation: Operation | undefined;
let savedValues: Record<string, unknown> | undefined;
const selectLimit = vi.fn();
const txUpdate = vi.fn();
const txInsert = vi.fn();
const tx = { select: () => ({ from: () => ({ where: () => ({ limit: selectLimit }) }) }), update: txUpdate, insert: txInsert };

function identity(organizationId: string = qaOrg) {
  return { organizationId, planCode: "starter" as const, billingInterval: "month" as const,
    priceReference: "price_synthetic", config,
    appUrl: "https://zaltyko-sandbox-preview.vercel.app", databaseUrl };
}
function makeOperation(organizationId: string = qaOrg): Operation {
  const qa = resolveShortPaidCheckoutEnvelope({ identity: identity(organizationId), createdAt });
  const requestHash = qa?.requestHash ?? createHash("sha256").update(JSON.stringify({
    organizationId, planCode: "starter", billingInterval: "month", environment: config.environment,
    providerAccountReference: config.providerAccountReference, priceReference: "price_synthetic", requestVersion: 2,
  })).digest("hex");
  const id = "f0000000-0000-4000-8000-000000000001";
  return { id, organizationId, planCode: "starter", billingInterval: "month", ...config, createdAt, requestHash,
    stripeIdempotencyKey: qa ? shortPaidStripeIdempotencyKey(id, requestHash) : `zaltyko-saas-checkout-${id}`,
    status: "recovery_required", checkoutSessionReference: null, sessionExpiresAt: null,
    customerId: "customer-row", leaseToken: null, leaseUntil: null, fencingVersion: 1 };
}
function session(expiresAt?: number) {
  if (!operation) throw new Error("Missing synthetic operation");
  const qa = resolveShortPaidCheckoutEnvelope({ identity: identity(operation.organizationId), operation });
  return { id: "cs_synthetic", mode: "subscription", status: "open", customer: "cus_synthetic", livemode: false,
    expires_at: expiresAt ?? qa?.expiresAt ?? 4070908800, url: "https://checkout.stripe.com/c/pay/synthetic",
    metadata: { zaltyko_saas: "true", organization_saas_checkout_operation_id: operation.id,
      organization_id: operation.organizationId, plan_code: "starter", billing_interval: "month",
      provider_account_reference: config.providerAccountReference, environment: "test" },
    line_items: { data: [{ quantity: 1, price }] } };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(createdAt);
  vi.stubEnv("SAAS_QA_SHORT_PAID_ENABLED", "true");
  vi.stubEnv("SAAS_QA_SHORT_PAID_RUN", SHORT_PAID_QA_RUN);
  vi.stubEnv("SAAS_QA_SHORT_PAID_EXPIRES_AT", "2026-10-22T18:30:00Z");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://aeeootdmuiqkfeernskw.supabase.co");
  vi.stubEnv("DATABASE_URL", databaseUrl);
  vi.stubEnv("DATABASE_URL_POOL", databaseUrl);
  vi.stubEnv("DATABASE_URL_DIRECT", databaseUrl);
  operation = undefined; savedValues = undefined;
  mocks.config.mockReturnValue(config);
  mocks.appUrl.mockReturnValue("https://zaltyko-sandbox-preview.vercel.app");
  mocks.databaseUrl.mockReturnValue(databaseUrl);
  mocks.scope.mockImplementation(async ({ organizationId }) => ({ organizationId, memberId: "synthetic-member" }));
  mocks.effective.mockResolvedValue({ planCode: "free", source: "bootstrap" });
  mocks.lock.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  selectLimit.mockImplementation(async () => operation ? [operation] : []);
  txInsert.mockReturnValue({ values: (values: Record<string, unknown>) => ({ returning: async () => {
    savedValues = values;
    operation = { ...values, createdAt: values.createdAt ?? createdAt, checkoutSessionReference: null,
      sessionExpiresAt: null, customerId: null, leaseUntil: null } as Operation;
    return [operation];
  } }) });
  txUpdate.mockReturnValue({ set: (values: Record<string, unknown>) => ({ where: () => ({ returning: async () => {
    if (!operation) throw new Error("Missing synthetic operation");
    // Real SQL establishes a fresh lease; keep the mocked row's server fields.
    operation = { ...operation, status: String(values.status ?? operation.status),
      leaseToken: typeof values.leaseToken === "string" ? values.leaseToken : "synthetic-lease" };
    return [operation];
  } }) }) });
  mocks.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => {
    const org = operation?.organizationId ?? qaOrg;
    const customerKey = `zaltyko-saas-customer-${org}-test-${createHash("sha256").update(config.providerAccountReference).digest("hex").slice(0, 8)}`;
    const customerHash = createHash("sha256").update(JSON.stringify({ organizationId: org, environment: "test",
      providerAccountReference: config.providerAccountReference })).digest("hex");
    return [{ id: "customer-row", status: "ready", customerReference: "cus_synthetic", creationIdempotencyKey: customerKey,
      creationRequestHash: customerHash }];
  } }) }) }));
  mocks.update.mockReturnValue({ set: (values: Record<string, unknown>) => ({ where: () => values.status === "open"
    ? { returning: async () => [{ id: operation?.id }] }
    : Promise.resolve() }) });
  mocks.price.mockResolvedValue(price);
  mocks.create.mockResolvedValue({ id: "cs_synthetic" });
  mocks.retrieve.mockImplementation(async () => session());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("short paid Checkout orchestration with isolated dependencies", () => {
  it("persists a QA discriminator and derives the provider payload from the stored timestamp", async () => {
    await expect(createOwnerSaasCheckout(input)).resolves.toMatchObject({ replayed: false });
    expect(savedValues?.requestHash).toMatch(/^5341415351415633[a-f0-9]{48}$/);
    expect(savedValues?.createdAt).toEqual(createdAt);
    const qa = resolveShortPaidCheckoutEnvelope({ identity: identity(), operation: operation! })!;
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      expires_at: qa.expiresAt,
      line_items: [{ price: "price_synthetic", quantity: 1 }],
      subscription_data: { metadata: expect.any(Object), billing_cycle_anchor: qa.billingCycleAnchor,
        proration_behavior: "create_prorations" },
    }), { idempotencyKey: operation!.stripeIdempotencyKey });
    expect(mocks.customer).not.toHaveBeenCalled();
  });

  it("keeps the normal hash, Stripe key, and complete Checkout payload unchanged", async () => {
    await createOwnerSaasCheckout({ ...input, organizationId: normalOrg });
    const metadata = { zaltyko_saas: "true", organization_saas_checkout_operation_id: operation!.id,
      organization_id: normalOrg, plan_code: "starter", billing_interval: "month",
      provider_account_reference: config.providerAccountReference, environment: "test" };
    const returnUrl = new URL("https://zaltyko-sandbox-preview.vercel.app/owner/subscription");
    returnUrl.searchParams.set("organizationId", normalOrg); returnUrl.searchParams.set("checkout", "confirming");
    const cancelUrl = new URL(returnUrl); cancelUrl.searchParams.set("checkout", "cancelled");
    expect(savedValues?.requestHash).toBe(makeOperation(normalOrg).requestHash);
    expect(savedValues).not.toHaveProperty("createdAt");
    expect(mocks.databaseUrl).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ mode: "subscription", customer: "cus_synthetic",
      line_items: [{ price: "price_synthetic", quantity: 1 }], success_url: returnUrl.toString(),
      cancel_url: cancelUrl.toString(), integration_identifier: expect.any(String), metadata, subscription_data: { metadata },
    }, { idempotencyKey: `zaltyko-saas-checkout-${operation!.id}` });
  });

  it("replays an uncertain early creation with exactly the same payload and key after a local save failure", async () => {
    operation = makeOperation();
    let saves = 0;
    mocks.update.mockReturnValue({ set: (values: Record<string, unknown>) => ({ where: () => values.status === "open"
      ? { returning: async () => { if (++saves === 1) throw new Error("Synthetic save failure"); return [{ id: operation?.id }]; } }
      : Promise.resolve() }) });
    await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 503 });
    operation.status = "recovery_required";
    vi.setSystemTime(new Date(createdAt.getTime() + 5 * 60000));
    await expect(createOwnerSaasCheckout(input)).resolves.toMatchObject({ replayed: true });
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[0]).toEqual(mocks.create.mock.calls[1]);
    expect(txInsert).not.toHaveBeenCalled();
  });

  it.each([25 * 60000, 23 * 3600000])("does not claim or contact the provider for uncertain late recovery at +%sms", async (age) => {
    operation = makeOperation(); vi.setSystemTime(new Date(createdAt.getTime() + age));
    await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 409, details: { code: "CHECKOUT_RECOVERY_REQUIRED" } });
    expect(txUpdate).not.toHaveBeenCalled(); expect(mocks.price).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.customer).not.toHaveBeenCalled();
  });

  it.each(["expired", "failed", "completed", "recovery_required"])("never restarts a %s QA experiment with another browser key", async (status) => {
    operation = makeOperation(); operation.status = status;
    selectLimit.mockResolvedValueOnce([]).mockResolvedValueOnce([operation]);
    await expect(createOwnerSaasCheckout({ ...input, idempotencyKey: "another-browser-key" }))
      .rejects.toMatchObject({ status: 409, details: { code: "CHECKOUT_RECOVERY_REQUIRED" } });
    expect(txInsert).not.toHaveBeenCalled(); expect(txUpdate).not.toHaveBeenCalled();
    expect(mocks.price).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["open", "recovery_required"])("only retrieves a known %s session after the creation cutoff", async (status) => {
    operation = makeOperation(); operation.status = status; operation.checkoutSessionReference = "cs_synthetic";
    operation.sessionExpiresAt = new Date(createdAt.getTime() + 3600000);
    vi.setSystemTime(new Date(createdAt.getTime() + 35 * 60000));
    await expect(createOwnerSaasCheckout(input)).resolves.toMatchObject({ replayed: true });
    expect(mocks.retrieve).toHaveBeenCalledExactlyOnceWith("cs_synthetic", { expand: ["line_items.data.price"] });
    expect(mocks.price).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled(); expect(txUpdate).not.toHaveBeenCalled();
  });

  it("does not revive an expired known session", async () => {
    operation = makeOperation(); operation.status = "open"; operation.checkoutSessionReference = "cs_synthetic";
    operation.sessionExpiresAt = new Date(createdAt.getTime() + 3600000);
    vi.setSystemTime(operation.sessionExpiresAt);
    await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 409 });
    expect(mocks.retrieve).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["SAAS_QA_SHORT_PAID_ENABLED", "SAAS_QA_SHORT_PAID_RUN", "SAAS_QA_SHORT_PAID_EXPIRES_AT"])("never falls back to full month when %s disappears", async (name) => {
    operation = makeOperation(); vi.stubEnv(name, undefined);
    await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 503 });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it.each(["clock", "flag"])("rechecks %s after provider/DB waits before any Checkout creation", async (change) => {
    operation = makeOperation();
    mocks.price.mockImplementation(async () => {
      if (change === "clock") vi.setSystemTime(new Date(createdAt.getTime() + 25 * 60000));
      else vi.stubEnv("SAAS_QA_SHORT_PAID_ENABLED", "false");
      return price;
    });
    await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({ status: change === "clock" ? 409 : 503 });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.customer).not.toHaveBeenCalled();
  });

  it("rejects a provider session that did not retain the fixed QA expiry", async () => {
    operation = makeOperation(); mocks.retrieve.mockImplementation(async () => session(4070908800));
    await expect(createOwnerSaasCheckout(input)).rejects.toMatchObject({ status: 503 });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalled(); // uncertain provider result stays in the recovery path
  });
});
