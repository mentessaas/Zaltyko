import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: vi.fn(),
  liveReady: vi.fn(),
  client: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  access: vi.fn(),
  customer: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/lib/launch/commercial-launch-profile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/launch/commercial-launch-profile")>();
  const readyProfile = {
    ...actual.commercialLaunchProfile,
    taxId: "synthetic-tax-id",
    professionalAddress: "synthetic-address",
    registrationStatus: "verified" as const,
    supportMailboxVerified: true,
    taxTreatmentReviewed: true,
    checkoutTaxVerified: true,
    legalTextsApproved: true,
    liveReleaseApproved: true,
  };
  return {
    ...actual,
    isSaasCheckoutEnabled: (environment: "test" | "live") =>
      mocks.liveReady() || actual.isSaasCheckoutEnabled(environment),
    isSaasCheckoutEnabledForMarket: (environment: "test" | "live", countryCode: string) =>
      actual.isSaasCheckoutEnabledForMarket(
        environment,
        countryCode,
        mocks.liveReady() ? readyProfile : actual.commercialLaunchProfile
      ),
  };
});
vi.mock("@/lib/authz", () => ({
  withTenant: (handler: (request: Request, context: unknown) => unknown) =>
    (request: Request) => handler(request, {
      userId: "synthetic-owner", profile: { id: "synthetic-profile", role: "owner" },
    }),
}));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (handler: unknown) => handler,
  getUserIdentifier: () => "synthetic-owner",
}));
vi.mock("@/db", () => ({ db: { select: mocks.select, insert: mocks.insert } }));
vi.mock("@/db/schema", () => ({ plans: {}, subscriptions: {} }));
vi.mock("@/lib/env", () => ({
  getOptionalEnvVar: mocks.env,
  getAppUrl: () => "https://example.invalid",
}));
vi.mock("@/lib/stripe/client", () => ({ getStripeClient: mocks.client }));
vi.mock("@/lib/billing/access", () => ({ getBillingAcademyAccess: mocks.access }));
vi.mock("@/lib/growth/events", () => ({ recordGrowthEvent: vi.fn() }));
vi.mock("@/lib/api-error-handler", () => ({
  handleApiError: () => new Response(null, { status: 500 }),
}));

import { POST } from "@/app/api/billing/checkout/route";

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.liveReady.mockReturnValue(false);
  mocks.client.mockReturnValue({
    customers: { create: mocks.customer },
    checkout: { sessions: { create: mocks.session } },
  });
});

function request(body: Record<string, unknown> = {}) {
  return new Request("https://example.invalid/api/billing/checkout", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function expectNoSideEffects() {
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.customer).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
}

describe("legacy Checkout respects the real commercial launch gate", () => {
  it.each(["sk_live_synthetic", "rk_live_synthetic", "unrecognized_synthetic", " sk_test_synthetic"])(
    "rejects %s before initialization, validation or database access while launch is pending",
    async (key) => {
      mocks.env.mockReturnValue(key);
      const response = await POST(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        ok: false, code: "BILLING_CONFIGURATION_UNAVAILABLE",
      });
      expectNoSideEffects();
    }
  );

  it.each(["sk_test_synthetic", "rk_test_synthetic"])(
    "preserves test validation with %s instead of applying the Live gate",
    async (key) => {
      mocks.env.mockReturnValue(key);
      const response = await POST(request());
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expectNoSideEffects();
    }
  );
  it.each(["MX", "FR", null])(
    "rejects market %s after ownership validation without financial effects when seller readiness opens",
    async (countryCode) => {
      mocks.liveReady.mockReturnValue(true);
      mocks.env.mockReturnValue("sk_live_synthetic");
      mocks.access.mockResolvedValue({
        id: "10000000-0000-4000-8000-000000000001",
        ownerUserId: "synthetic-owner",
        countryCode,
      });
      const response = await POST(request({
        academyId: "10000000-0000-4000-8000-000000000001",
        planCode: "pro",
      }));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        ok: false,
        code: "SAAS_MARKET_NOT_ENABLED",
      });
      expect(mocks.access).toHaveBeenCalledOnce();
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.customer).not.toHaveBeenCalled();
      expect(mocks.session).not.toHaveBeenCalled();
    }
  );

});
