import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructSaasEvent: vi.fn(),
  constructLegacyEvent: vi.fn(),
  processSaas: vi.fn(),
  saasConfig: vi.fn(),
  saasVerification: vi.fn(),
  recordBillingEvent: vi.fn(),
  updateBillingEventStatus: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = { constructEvent: mocks.constructSaasEvent };
  },
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: mocks.constructLegacyEvent },
  }),
}));
vi.mock("@/modules/saas-billing/application/saas-billing-config", () => ({
  getSaasStripeConfig: mocks.saasConfig,
  getSaasStripeWebhookVerificationConfig: mocks.saasVerification,
}));
vi.mock(
  "@/modules/saas-billing/application/webhook-service",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("@/modules/saas-billing/application/webhook-service")
    >();
    return { ...actual, processSaasBillingWebhook: mocks.processSaas };
  }
);
vi.mock("@/lib/stripe/billing-events-service", () => ({
  recordBillingEvent: mocks.recordBillingEvent,
  updateBillingEventStatus: mocks.updateBillingEventStatus,
}));
vi.mock("@/lib/stripe/subscription-service", () => ({
  handleSubscriptionEvent: vi.fn(),
}));
vi.mock("@/lib/stripe/invoice-service", () => ({
  handleInvoiceEvent: vi.fn(),
}));

import { handleStripeWebhook } from "@/lib/stripe/webhook-handler";

const event = {
  id: "evt_saas_dispatch_test",
  object: "event",
  type: "invoice.paid",
  created: 1_792_417_200,
  livemode: false,
  data: {
    object: {
      id: "in_saas_dispatch_test",
      object: "invoice",
      metadata: { zaltyko_saas: "true" },
    },
  },
} as never;

const saasConfig = {
  environment: "test",
  secretKey: "sk_test_synthetic",
  webhookSecret: "whsec_synthetic",
  providerAccountReference: "acct_synthetic",
  portalEnabled: true,
  prices: {
    starter: { month: "price_starter_month", year: "price_starter_year" },
    growth: { month: "price_growth_month", year: "price_growth_year" },
  },
};

function request(signature: string | null = "t=1,v1=synthetic") {
  return new Request("https://example.invalid/api/stripe/webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body: "{\"synthetic\":true}",
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_legacy_synthetic");
  mocks.saasVerification.mockReturnValue({
    environment: "test",
    secretKey: "sk_test_synthetic",
    webhookSecret: "whsec_synthetic",
  });
  mocks.saasConfig.mockReturnValue(saasConfig);
  mocks.processSaas.mockResolvedValue({ duplicate: false });
});

afterEach(() => vi.unstubAllEnvs());

describe("SaaS Stripe webhook dispatch", () => {
  it.each([null, "t=1,v1=invalid"])("rejects missing/invalid SaaS signature %s with 400 when legacy is absent", async (signature) => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    mocks.constructSaasEvent.mockImplementation(() => { throw new Error("Invalid signature"); });
    const response = await handleStripeWebhook(request(signature));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "SIGNATURE_VERIFICATION_FAILED" });
    expect(mocks.processSaas).not.toHaveBeenCalled();
    expect(mocks.recordBillingEvent).not.toHaveBeenCalled();
    expect(mocks.constructLegacyEvent).not.toHaveBeenCalled();
  });

  it("keeps a genuine missing-verifier configuration as a server error", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    mocks.saasVerification.mockReturnValue(null);
    const response = await handleStripeWebhook(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "WEBHOOK_NOT_CONFIGURED" });
    expect(mocks.processSaas).not.toHaveBeenCalled();
    expect(mocks.recordBillingEvent).not.toHaveBeenCalled();
  });

  it("still verifies a legitimate legacy event independently after a SaaS mismatch", async () => {
    mocks.constructSaasEvent.mockImplementation(() => { throw new Error("SaaS mismatch"); });
    mocks.constructLegacyEvent.mockReturnValue({ id: "evt_legacy", type: "invoice.paid", data: { object: { id: "in_legacy" } } });
    mocks.recordBillingEvent.mockResolvedValue({ shouldProcess: false });
    const response = await handleStripeWebhook(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true });
    expect(mocks.constructLegacyEvent).toHaveBeenCalledExactlyOnceWith(
      expect.any(String), expect.any(String), "whsec_legacy_synthetic", 300
    );
    expect(mocks.processSaas).not.toHaveBeenCalled();
  });

  it.each(["whsec_legacy_synthetic", ""])("dispatches SaaS only after its own signature verification (legacy=%s)", async (legacySecret) => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", legacySecret);
    mocks.constructSaasEvent.mockReturnValue(event);

    const response = await handleStripeWebhook(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      received: true,
      duplicate: false,
      ignored: false,
      quarantined: false,
    });
    expect(mocks.processSaas).toHaveBeenCalledWith({
      event,
      rawBody: "{\"synthetic\":true}",
      config: saasConfig,
    });
    expect(mocks.constructLegacyEvent).not.toHaveBeenCalled();
  });

  it("keeps missing SaaS business configuration unavailable after a valid signature", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    mocks.constructSaasEvent.mockReturnValue(event);
    mocks.saasConfig.mockReturnValue(null);
    const response = await handleStripeWebhook(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "WEBHOOK_NOT_CONFIGURED" });
    expect(mocks.processSaas).not.toHaveBeenCalled();
    expect(mocks.recordBillingEvent).not.toHaveBeenCalled();
  });

  it("does not let a legacy signature authorize a SaaS-marked event", async () => {
    mocks.constructSaasEvent.mockImplementation(() => {
      throw new Error("SaaS signature mismatch");
    });
    mocks.constructLegacyEvent.mockReturnValue(event);

    const response = await handleStripeWebhook(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "SIGNATURE_VERIFICATION_FAILED",
    });
    expect(mocks.processSaas).not.toHaveBeenCalled();
    expect(mocks.recordBillingEvent).not.toHaveBeenCalled();
  });
});
