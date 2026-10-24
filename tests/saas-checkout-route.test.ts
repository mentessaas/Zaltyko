import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  scope: vi.fn(),
  checkout: vi.fn(),
  portal: vi.fn(),
  trial: vi.fn(),
  snapshot: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 30, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (_: Request, org: string) =>
    `verified:${org}`,
  rateLimit: mocks.rate,
  rateLimitExceededResponse: () =>
    new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/modules/saas-billing/application/saas-billing-service", () => ({
  createOwnerSaasCheckout: mocks.checkout,
  createOwnerSaasPortal: mocks.portal,
  startOwnerSaasTrial: mocks.trial,
  getOwnerSaasBillingSnapshot: mocks.snapshot,
}));
vi.mock("@/modules/saas-billing/application/owner-access", () => ({
  resolveSaasOwnerScope: mocks.scope,
  hasSameOrigin: (request: Request) =>
    request.headers.get("origin") === new URL(request.url).origin,
}));

import { POST } from "@/app/api/v1/owner/saas/checkout/route";
import { POST as portal } from "@/app/api/v1/owner/saas/portal/route";
import { POST as trial } from "@/app/api/v1/owner/saas/trial/start/route";
import { GET as billing } from "@/app/api/v1/owner/saas/billing/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const body = { organizationId, planCode: "starter", billingInterval: "month" };
function request(
  payload: unknown = body,
  origin = "https://example.invalid",
  key = "synthetic-key-001"
) {
  return new Request("https://example.invalid/api/v1/owner/saas/checkout", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.user.mockResolvedValue({ id: "synthetic-user" });
  mocks.scope.mockResolvedValue({ organizationId });
  mocks.rate.mockResolvedValue({ success: true });
  mocks.portal.mockResolvedValue({
    portalUrl: "https://billing.stripe.com/synthetic",
  });
  mocks.trial.mockResolvedValue({
    trialId: "trial-1",
    startsAt: new Date("2026-10-20T00:00:00Z"),
    endsAt: new Date("2026-10-27T00:00:00Z"),
    entitlementRevision: 2,
    replayed: false,
  });
  mocks.snapshot.mockResolvedValue({ organization: { id: organizationId } });
  mocks.checkout.mockResolvedValue({
    operationId: "operation-1",
    checkoutUrl: "https://checkout.stripe.com/synthetic",
    expiresAt: new Date("2026-10-20T00:00:00Z"),
    status: "pending",
    replayed: false,
  });
});

describe.each([
  ["Portal", portal, mocks.portal],
  ["trial", trial, mocks.trial],
] as const)("SaaS %s HTTP guards", (_name, handler, service) => {
  it("requires authentication", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await handler(request({ organizationId }))).status).toBe(401);
    expect(service).not.toHaveBeenCalled();
  });
  it("rejects a foreign origin", async () => {
    expect(
      (await handler(request({ organizationId }, "https://foreign.invalid")))
        .status
    ).toBe(403);
    expect(service).not.toHaveBeenCalled();
  });
  it("rejects browser-controlled fields", async () => {
    expect(
      (
        await handler(
          request({ organizationId, customerId: "forged", planCode: "growth" })
        )
      ).status
    ).toBe(400);
    expect(service).not.toHaveBeenCalled();
  });
  it("rejects a missing idempotency key", async () => {
    expect(
      (
        await handler(
          request({ organizationId }, "https://example.invalid", "")
        )
      ).status
    ).toBe(400);
    expect(service).not.toHaveBeenCalled();
  });
  it.each([
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
  ] as const)("preserves %s", async (code, status) => {
    mocks.scope.mockRejectedValue(new OperationalError(code, "Denied", status));
    expect((await handler(request({ organizationId }))).status).toBe(status);
    expect(service).not.toHaveBeenCalled();
  });
  it("stops at the rate limit", async () => {
    mocks.rate.mockResolvedValue({ success: false });
    expect((await handler(request({ organizationId }))).status).toBe(429);
    expect(service).not.toHaveBeenCalled();
  });
  it("binds identity and idempotency on success", async () => {
    const response = await handler(request({ organizationId }));
    expect(response.status).toBe(_name === "trial" ? 201 : 200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(service).toHaveBeenCalledWith({
      organizationId,
      userId: "synthetic-user",
      idempotencyKey: "synthetic-key-001",
    });
  });
});

describe("SaaS billing read contract", () => {
  function get(query = `organizationId=${organizationId}`) {
    return new Request(
      `https://example.invalid/api/v1/owner/saas/billing?${query}`
    );
  }
  it("requires authentication", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await billing(get())).status).toBe(401);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it.each([
    "",
    "organizationId=invalid",
    `organizationId=${organizationId}&organizationId=${organizationId}`,
    `organizationId=${organizationId}&userId=forged`,
    `organizationId=${organizationId}&customerId=forged`,
  ])("rejects ambiguous or invalid query %s", async (query) => {
    expect((await billing(get(query))).status).toBe(400);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it("does not read another organization after denied scope", async () => {
    mocks.scope.mockRejectedValue(
      new OperationalError("NOT_FOUND", "Denied", 404)
    );
    expect((await billing(get())).status).toBe(404);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it("rate-limits before reading the snapshot", async () => {
    mocks.rate.mockResolvedValue({ success: false });
    expect((await billing(get())).status).toBe(429);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it("uses the authenticated user and verified organization", async () => {
    const response = await billing(get());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.snapshot).toHaveBeenCalledWith({
      organizationId,
      userId: "synthetic-user",
    });
  });
});

describe("SaaS Checkout HTTP contract with isolated dependencies", () => {
  it("uses the public organization-not-found code without revealing scope", async () => {
    mocks.scope.mockRejectedValue(
      new OperationalError("NOT_FOUND", "Denied", 404)
    );
    const response = await POST(request());
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "ORGANIZATION_NOT_FOUND",
    });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("does not promote an arbitrary detail code into the public contract", async () => {
    mocks.checkout.mockRejectedValue(
      new OperationalError("INVALID_STATE_TRANSITION", "Denied", 409, {
        code: "UNREVIEWED_DETAIL",
      })
    );
    const response = await POST(request());
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "INVALID_STATE_TRANSITION",
    });
  });

  it.each([
    ["INVALID_STATE_TRANSITION", "CHECKOUT_IN_PROGRESS", 409],
    ["INVALID_STATE_TRANSITION", "CHECKOUT_EXPIRED", 409],
    ["INVALID_STATE_TRANSITION", "SUBSCRIPTION_ALREADY_EXISTS", 409],
    ["FEATURE_NOT_AVAILABLE", "BILLING_CONFIGURATION_UNAVAILABLE", 503],
    ["FEATURE_NOT_AVAILABLE", "BILLING_PROVIDER_UNAVAILABLE", 503],
  ] as const)(
    "exposes the agreed commercial error %s/%s",
    async (internalCode, publicCode, status) => {
      mocks.checkout.mockRejectedValue(
        new OperationalError(internalCode, "Synthetic rejection", status, {
          code: publicCode,
        })
      );
      const response = await POST(request());
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({
        ok: false,
        code: publicCode,
      });
    }
  );

  it("requires authentication before invoking scope or provider service", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("denies foreign origin before service access", async () => {
    expect((await POST(request(body, "https://foreign.invalid"))).status).toBe(
      403
    );
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it.each([
    { ...body, organizationId: "invalid" },
    { ...body, billingInterval: "week" },
    { ...body, customerId: "forged" },
    { ...body, priceId: "forged" },
    { ...body, successUrl: "https://foreign.invalid" },
    { ...body, billing_cycle_anchor: 1792713600 },
    { ...body, expires_at: 1792630800 },
    { ...body, subscription_data: { billing_cycle_anchor: 1792713600 } },
    { ...body, qaRun: "short-paid-expiry-20261021-v3" },
  ])(
    "rejects invalid or browser-controlled provider parameters %#",
    async (payload) => {
      expect((await POST(request(payload))).status).toBe(400);
      expect(mocks.checkout).not.toHaveBeenCalled();
    }
  );

  it.each(["free", "network"])("rejects %s self-service", async (planCode) => {
    expect((await POST(request({ ...body, planCode }))).status).toBe(422);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("requires a valid idempotency key", async () => {
    expect(
      (await POST(request(body, "https://example.invalid", ""))).status
    ).toBe(400);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it.each([
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
  ] as const)("preserves scope rejection %s", async (code, status) => {
    mocks.scope.mockRejectedValue(new OperationalError(code, "Denied", status));
    expect((await POST(request())).status).toBe(status);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("rate-limits using the verified organization before invoking service", async () => {
    mocks.rate.mockResolvedValue({ success: false });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(mocks.rate).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: `verified:${organizationId}` })
    );
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "returns pending, never paid, with replay=%s",
    async (replayed) => {
      mocks.checkout.mockResolvedValue({
        operationId: "operation-1",
        checkoutUrl: "https://checkout.stripe.com/synthetic",
        expiresAt: new Date("2026-10-20T00:00:00Z"),
        status: "pending",
        replayed,
      });
      const response = await POST(request());
      expect(response.status).toBe(replayed ? 200 : 201);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toMatchObject({
        ok: true,
        data: { status: "pending", operationId: "operation-1" },
      });
      expect(mocks.checkout).toHaveBeenCalledWith({
        ...body,
        userId: "synthetic-user",
        idempotencyKey: "synthetic-key-001",
      });
    }
  );

  it("does not expose unexpected provider errors", async () => {
    mocks.checkout.mockRejectedValue(new Error("internal-provider-details"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("internal-provider-details");
  });
});
