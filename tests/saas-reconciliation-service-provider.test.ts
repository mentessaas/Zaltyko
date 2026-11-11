/**
 * Characterization gaps of the SaaS reconciliation service, added before its
 * refactor (P2 #19). saas-reconciliation-service-characterization.test.ts
 * always injects a fake `provider`, so the real Stripe wiring (`providerFor`
 * and the default runtime) never runs there; and no test accepts the smallest
 * batch size. These tests pin both on the current code.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  createSaasStripeClient: vi.fn(),
  retrieveSubscription: vi.fn(),
  retrieveInvoice: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    execute: mocks.execute,
    select: mocks.select,
    transaction: mocks.transaction,
  },
}));

vi.mock("@/modules/saas-billing/application/saas-billing-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/saas-billing/application/saas-billing-config")>()),
  createSaasStripeClient: mocks.createSaasStripeClient,
}));

import {
  consumeSaasReconciliationBatch,
  previewSaasReconciliation,
} from "@/modules/saas-billing/application/reconciliation-service";
import type { SaasStripeConfig } from "@/modules/saas-billing/application/saas-billing-config";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const eventId = "20000000-0000-4000-8000-000000000001";
const actorUserId = "30000000-0000-4000-8000-000000000001";
const organizationId = "40000000-0000-4000-8000-000000000001";

const config: SaasStripeConfig = {
  environment: "test",
  secretKey: "sk_test_synthetic",
  webhookSecret: "whsec_synthetic",
  providerAccountReference: "acct_synthetic",
  portalEnabled: false,
  prices: {
    starter: { month: "price_starter_month", year: "price_starter_year" },
    growth: { month: "price_growth_month", year: "price_growth_year" },
  },
};

function eventRow(eventType: string, objectReference: string) {
  return {
    id: eventId,
    organization_id: organizationId,
    provider_account_reference: "acct_synthetic",
    environment: "test",
    provider_event_id: "evt_synthetic",
    event_account_reference: null,
    event_type: eventType,
    event_created_at: "2026-11-10 11:00:00+00",
    provider_object_reference: objectReference,
    livemode: false,
    payload_sha256: "a".repeat(64),
    status: "quarantined",
    last_error_code: "ambiguous_event_order",
    fencing_version: 3,
    reconciliation_decision_id: null,
  };
}

const outage = new Error("synthetic Stripe outage");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => [{ role: "super_admin", isSuspended: false }],
      }),
    }),
  }));
  mocks.retrieveSubscription.mockRejectedValue(outage);
  mocks.retrieveInvoice.mockRejectedValue(outage);
  mocks.createSaasStripeClient.mockImplementation(() => ({
    subscriptions: { retrieve: mocks.retrieveSubscription },
    invoices: { retrieve: mocks.retrieveInvoice },
  }));
});

async function previewFailure(eventType: string, objectReference: string) {
  mocks.execute.mockResolvedValue({ rows: [eventRow(eventType, objectReference)] });
  const error = await previewSaasReconciliation(
    { eventId, actorUserId, requestId: "request-synthetic" },
    { config, signingSecret: "s".repeat(32) }
  ).then(
    () => null,
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(OperationalError);
  const operational = error as OperationalError;
  return {
    code: operational.code,
    status: operational.status,
    publicCode: operational.details?.code,
  };
}

describe("reconciliation: real Stripe wiring (providerFor)", () => {
  it("builds the Stripe client from the configuration and expands the subscription price and latest invoice", async () => {
    await expect(
      previewFailure("customer.subscription.updated", "sub_synthetic")
    ).resolves.toEqual({
      code: "FEATURE_NOT_AVAILABLE",
      status: 503,
      publicCode: "PROVIDER_UNAVAILABLE",
    });
    expect(mocks.createSaasStripeClient).toHaveBeenCalledTimes(1);
    expect(mocks.createSaasStripeClient).toHaveBeenCalledWith(config);
    expect(mocks.retrieveSubscription.mock.calls).toEqual([
      ["sub_synthetic", { expand: ["items.data.price", "latest_invoice"] }],
    ]);
    expect(mocks.retrieveInvoice).not.toHaveBeenCalled();
  });

  it("reads an invoice event first, expanding its line prices", async () => {
    await expect(previewFailure("invoice.paid", "in_synthetic")).resolves.toEqual({
      code: "FEATURE_NOT_AVAILABLE",
      status: 503,
      publicCode: "PROVIDER_UNAVAILABLE",
    });
    expect(mocks.createSaasStripeClient).toHaveBeenCalledWith(config);
    expect(mocks.retrieveInvoice.mock.calls).toEqual([
      ["in_synthetic", { expand: ["lines.data.price"] }],
    ]);
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("does not build a Stripe client when a provider is injected", async () => {
    mocks.execute.mockResolvedValue({
      rows: [eventRow("customer.subscription.updated", "sub_synthetic")],
    });
    const provider = {
      retrieveSubscription: vi.fn().mockRejectedValue(outage),
      retrieveInvoice: vi.fn(),
    };
    await expect(
      previewSaasReconciliation(
        { eventId, actorUserId, requestId: "request-synthetic" },
        { config, provider, signingSecret: "s".repeat(32) }
      )
    ).rejects.toBeInstanceOf(OperationalError);
    expect(mocks.createSaasStripeClient).not.toHaveBeenCalled();
    expect(provider.retrieveSubscription).toHaveBeenCalledWith("sub_synthetic");
  });
});

describe("reconciliation: batch size boundaries", () => {
  it("accepts a batch of one", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(
      consumeSaasReconciliationBatch({ batchSize: 1 }, { config })
    ).resolves.toEqual({ claimed: 0, applied: 0, stale: 0, retrying: 0, leaseLost: 0 });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.createSaasStripeClient).not.toHaveBeenCalled();
  });
});
