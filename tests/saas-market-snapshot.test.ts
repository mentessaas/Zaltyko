import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  scope: vi.fn(),
  effective: vi.fn(),
  config: vi.fn(),
  liveReadinessOpen: false,
  select: vi.fn(),
  selectRows: [] as unknown[][],
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  stripeClient: vi.fn(),
}));

vi.mock("@/lib/launch/commercial-launch-profile", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/launch/commercial-launch-profile")>();
  const readyProfile = {
    legalName: "Synthetic Seller",
    countryCode: "ES",
    taxId: "SYNTHETIC-TAX-ID",
    professionalAddress: "1 Test Street, Madrid",
    supportEmail: "billing@example.invalid",
    registrationStatus: "verified" as const,
    supportMailboxVerified: true,
    taxTreatmentReviewed: true,
    checkoutTaxVerified: true,
    legalTextsApproved: true,
    liveReleaseApproved: true,
  };

  return {
    ...actual,
    isSaasCheckoutEnabledForMarket: (
      environment: "test" | "live",
      countryCode: string
    ) =>
      actual.isSaasCheckoutEnabledForMarket(
        environment,
        countryCode,
        mocks.liveReadinessOpen ? readyProfile : actual.commercialLaunchProfile
      ),
  };
});

vi.mock("@/db", () => ({
  db: {
    transaction: mocks.transaction,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  },
}));

vi.mock("@/lib/env", () => ({
  getAppUrl: () => "https://example.invalid",
  getDatabaseUrl: () => "postgres://synthetic.invalid",
}));

vi.mock("@/modules/saas-billing/application/owner-access", () => ({
  resolveSaasOwnerScope: mocks.scope,
}));

vi.mock("@/modules/saas-billing/application/entitlement-service", () => ({
  resolveEffectiveOrganizationEntitlement: mocks.effective,
  lockOrganizationForSaasMutation: vi.fn(),
  grantOrganizationEntitlement: vi.fn(),
}));

vi.mock("@/modules/saas-billing/application/saas-billing-config", () => ({
  getSaasStripeConfig: mocks.config,
  createSaasStripeClient: mocks.stripeClient,
  priceForPlan: vi.fn(),
}));

import { getOwnerSaasBillingSnapshot } from "@/modules/saas-billing/application/saas-billing-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "synthetic-owner";
const at = new Date("2026-10-20T12:00:00.000Z");
const effectiveFrom = new Date("2026-10-01T00:00:00.000Z");
const currentPeriodEndsAt = new Date("2026-11-01T00:00:00.000Z");

interface SelectQuery {
  from(): SelectQuery;
  where(...args: unknown[]): SelectQuery;
  orderBy(...args: unknown[]): SelectQuery;
  limit(...args: unknown[]): Promise<unknown[]>;
}

const tx = {
  select: mocks.select,
  insert: mocks.insert,
  update: mocks.update,
  delete: mocks.delete,
};

function effectiveEntitlement(
  planCode: "free" | "starter",
  source: "free" | "stripe_subscription"
) {
  return {
    planCode,
    source,
    revision: 1,
    effectiveFrom,
    effectiveUntil: null,
    limits: {
      athleteLimit: 30,
      groupLimit: 3,
      classLimit: 10,
      academyLimit: 1,
    },
  };
}

function queueSnapshotSelects(...rows: unknown[][]) {
  mocks.selectRows = [...rows];
  mocks.select.mockImplementation(() => {
    const result = mocks.selectRows.shift() ?? [];
    const query: SelectQuery = {
      from: () => query,
      where: () => query,
      orderBy: () => query,
      limit: async () => result,
    };
    return query;
  });
}

function expectNoExternalOrWriteEffects() {
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
  expect(mocks.stripeClient).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.liveReadinessOpen = true;
  mocks.scope.mockResolvedValue({
    organizationId,
    organizationName: "Synthetic Academy",
    memberId: "synthetic-member",
    userId,
    countryCode: "MX",
  });
  mocks.effective.mockResolvedValue(effectiveEntitlement("free", "free"));
  mocks.config.mockReturnValue({
    environment: "live",
    providerAccountReference: "acct_synthetic",
    portalEnabled: true,
  });
  mocks.transaction.mockImplementation(
    async (callback: (transaction: typeof tx) => unknown) => callback(tx)
  );
  mocks.insert.mockImplementation(() => {
    throw new Error("Snapshot must not write to the database");
  });
  mocks.update.mockImplementation(() => {
    throw new Error("Snapshot must not write to the database");
  });
  mocks.delete.mockImplementation(() => {
    throw new Error("Snapshot must not write to the database");
  });
  mocks.stripeClient.mockImplementation(() => {
    throw new Error("Snapshot must not initialize a Stripe client");
  });
});

describe("owner SaaS billing snapshot market actions", () => {
  it("blocks Live checkout for a Mexican Free academy while preserving trial eligibility", async () => {
    queueSnapshotSelects([], [], [], [], []);

    const snapshot = await getOwnerSaasBillingSnapshot({
      userId,
      organizationId,
      at,
    });

    expect(snapshot.trial.eligible).toBe(true);
    expect(snapshot.actions).toMatchObject({
      canStartTrial: true,
      canCheckoutStarter: false,
      canCheckoutGrowth: false,
      canOpenPortal: false,
    });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.select).toHaveBeenCalledTimes(5);
    expectNoExternalOrWriteEffects();
  });

  it("preserves Portal access for an existing Mexican paid subscriber", async () => {
    mocks.effective.mockResolvedValue(
      effectiveEntitlement("starter", "stripe_subscription")
    );
    queueSnapshotSelects(
      [],
      [{ source: "stripe_subscription", subscriptionId: "synthetic-subscription" }],
      [
        {
          providerStatus: "active",
          billingInterval: "month",
          currentPeriodEndsAt,
          customerReference: "cus_synthetic",
          cancelAtPeriodEnd: false,
        },
      ],
      [{ customerReference: "cus_synthetic" }],
      [],
      []
    );

    const snapshot = await getOwnerSaasBillingSnapshot({
      userId,
      organizationId,
      at,
    });

    expect(snapshot.actions).toMatchObject({
      canStartTrial: false,
      canCheckoutStarter: false,
      canCheckoutGrowth: false,
      canOpenPortal: true,
    });
    expect(mocks.select).toHaveBeenCalledTimes(6);
    expectNoExternalOrWriteEffects();
  });

  it("keeps Test Checkout available for a Mexican Free academy when Live readiness is closed", async () => {
    mocks.liveReadinessOpen = false;
    mocks.config.mockReturnValue({
      environment: "test",
      providerAccountReference: "acct_synthetic_test",
      portalEnabled: true,
    });
    queueSnapshotSelects([], [], [], [], []);

    const snapshot = await getOwnerSaasBillingSnapshot({
      userId,
      organizationId,
      at,
    });

    expect(snapshot.trial.eligible).toBe(true);
    expect(snapshot.actions).toMatchObject({
      canStartTrial: true,
      canCheckoutStarter: true,
      canCheckoutGrowth: true,
      canOpenPortal: false,
    });
    expect(mocks.select).toHaveBeenCalledTimes(5);
    expectNoExternalOrWriteEffects();
  });
});
