import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  getManualPaymentOptions: vi.fn(),
  recordManualPaymentForCharge: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.currentUser,
}));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 30, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (
    _request: Request,
    organizationId: string
  ) => `verified:${organizationId}`,
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () =>
    new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.ownerScope,
}));
vi.mock("@/modules/billing/application/manual-payments", () => ({
  getManualPaymentOptions: mocks.getManualPaymentOptions,
}));
vi.mock("@/modules/billing/application/ledger-service", () => ({
  recordManualPaymentForCharge: mocks.recordManualPaymentForCharge,
}));

import { POST } from "@/app/api/v1/owner/billing/manual-payments/route";

const organizationId = "10000000-0000-4000-8000-000000000001";
const memberId = "20000000-0000-4000-8000-000000000002";
const userId = "30000000-0000-4000-8000-000000000003";
const chargeId = "40000000-0000-4000-8000-000000000004";
const idempotencyKey = "manual-payment-command-01";
const receivedAt = "2026-10-24T10:00:00.000Z";
const payload = {
  organizationId,
  chargeId,
  amountCents: 2500,
  method: "bank_transfer",
  reference: "transfer-qa-01",
  receivedAt,
};

function request(body: unknown = payload, key = idempotencyKey) {
  return new Request(
    "https://example.invalid/api/v1/owner/billing/manual-payments",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify(body),
    }
  );
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
    member: { id: memberId, role: "owner", locationScopeMode: "all" },
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.recordManualPaymentForCharge.mockResolvedValue({
    payment: {
      id: "50000000-0000-4000-8000-000000000005",
      amountCents: payload.amountCents,
      currency: "EUR",
      receivedAt: new Date(receivedAt),
      manualMethod: payload.method,
    },
    allocation: {
      id: "60000000-0000-4000-8000-000000000006",
      chargeId,
    },
  });
});

describe("Owner manual-payment HTTP boundary", () => {
  it("requires the session before parsing or resolving tenant scope", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const malformed = new Request(
      "https://example.invalid/api/v1/owner/billing/manual-payments",
      { method: "POST", body: "{" }
    );

    const response = await POST(malformed);

    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.recordManualPaymentForCharge).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied actor, role, or payment processor fields", async () => {
    const response = await POST(
      request({
        ...payload,
        actor: { userId, memberId },
        role: "owner",
        processor: "stripe",
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.recordManualPaymentForCharge).not.toHaveBeenCalled();
  });

  it("rejects a missing idempotency key before any payment write", async () => {
    const response = await POST(request(payload, ""));

    expect(response.status).toBe(400);
    expect(mocks.recordManualPaymentForCharge).not.toHaveBeenCalled();
  });

  it("allows only Owner/Admin to register a payment", async () => {
    mocks.ownerScope.mockResolvedValueOnce({
      organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
      member: { id: memberId, role: "manager", locationScopeMode: "all" },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.recordManualPaymentForCharge).not.toHaveBeenCalled();
  });

  it("stops before the ledger write when the verified tenant is rate-limited", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(mocks.recordManualPaymentForCharge).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin"] as const)(
    "derives the actor and tenant from the authenticated scope for %s",
    async (role) => {
      mocks.ownerScope.mockResolvedValueOnce({
        organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
        member: { id: memberId, role, locationScopeMode: "all" },
      });

      const response = await POST(request());

      expect(response.status).toBe(201);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(mocks.ownerScope).toHaveBeenCalledWith({ userId, organizationId });
      expect(mocks.recordManualPaymentForCharge).toHaveBeenCalledWith({
        organizationId,
        chargeId,
        amountCents: payload.amountCents,
        method: payload.method,
        reference: payload.reference,
        receivedAt,
        idempotencyKey,
        actor: { userId, memberId },
      });
      expect(await response.json()).toMatchObject({
        ok: true,
        data: {
          paymentId: "50000000-0000-4000-8000-000000000005",
          allocationId: "60000000-0000-4000-8000-000000000006",
          chargeId,
          amountCents: payload.amountCents,
          method: payload.method,
        },
      });
    }
  );
});
