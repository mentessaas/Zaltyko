import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/rate-limit";
import { recordManualPaymentForCharge } from "@/modules/billing/application/ledger-service";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { POST } from "@/app/api/v1/owner/billing/manual-payments/route";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: vi.fn(() => ({ limit: 12, window: 60 })),
  getVerifiedTenantRateLimitIdentifier: vi.fn(() => "verified-tenant"),
  rateLimit: vi.fn(),
  rateLimitExceededResponse: vi.fn(),
}));
vi.mock("@/modules/billing/application/ledger-service", () => ({
  recordManualPaymentForCharge: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));

const actorUserId = "10000000-0000-4000-8000-000000000101";
const organizationId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000201";
const chargeId = "10000000-0000-4000-8000-000000000301";

function postRequest(
  body: unknown,
  idempotencyKey = "manual-payment-test-001"
) {
  return new Request(
    "https://zaltyko.test/api/v1/owner/billing/manual-payments",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
    }
  );
}

describe("manual payment endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimit).mockResolvedValue({
      success: true,
      limit: 12,
      remaining: 11,
      reset: 1_800_000_000,
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: actorUserId });
    vi.mocked(resolveOwnerScope).mockResolvedValue({
      organization: {
        id: organizationId,
        name: "Academia sintética",
        defaultCurrency: "EUR",
      },
      member: { id: memberId, role: "owner", locationScopeMode: "all" },
      locations: [],
      selectedLocationId: null,
      canViewOrganizationAggregate: true,
    });
    vi.mocked(recordManualPaymentForCharge).mockResolvedValue({
      payment: {
        id: "10000000-0000-4000-8000-000000000401",
        amountCents: 2500,
        currency: "EUR",
        receivedAt: new Date("2026-10-13T11:00:00.000Z"),
        manualMethod: "bank_transfer",
      } as never,
      allocation: {
        id: "10000000-0000-4000-8000-000000000501",
        chargeId,
      } as never,
    });
  });

  it("requires a verified session before parsing or processing the payment", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const request = new Request(
      "https://zaltyko.test/api/v1/owner/billing/manual-payments",
      { method: "POST", body: "not-json" }
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    expect(recordManualPaymentForCharge).not.toHaveBeenCalled();
  });

  it("derives tenant and actor from authenticated membership, not the body", async () => {
    const body = {
      organizationId,
      chargeId,
      amountCents: 2500,
      method: "bank_transfer",
      receivedAt: "2026-10-13T11:00:00.000Z",
    };

    const response = await POST(postRequest(body));
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(result.data).toMatchObject({
      chargeId,
      amountCents: 2500,
      currency: "EUR",
      method: "bank_transfer",
    });
    expect(recordManualPaymentForCharge).toHaveBeenCalledWith({
      organizationId,
      chargeId,
      amountCents: 2500,
      method: "bank_transfer",
      reference: undefined,
      receivedAt: "2026-10-13T11:00:00.000Z",
      idempotencyKey: "manual-payment-test-001",
      actor: { userId: actorUserId, memberId },
    });
  });

  it.each(["manager", "coach"])(
    "rejects synthetic %s scope before processing a payment",
    async (role) => {
      vi.mocked(resolveOwnerScope).mockResolvedValue({
        organization: { id: organizationId },
        member: { id: memberId, role, locationScopeMode: "all" },
      } as never);
      const response = await POST(
        postRequest({
          organizationId,
          chargeId,
          amountCents: 2500,
          method: "bank_transfer",
          receivedAt: "2026-10-13T11:00:00.000Z",
        })
      );
      expect(response.status).toBe(403);
      expect(rateLimit).not.toHaveBeenCalled();
      expect(recordManualPaymentForCharge).not.toHaveBeenCalled();
    }
  );

  it("rejects client-supplied actor or tenant role overrides", async () => {
    const response = await POST(
      postRequest({
        organizationId,
        chargeId,
        amountCents: 2500,
        method: "bank_transfer",
        receivedAt: "2026-10-13T11:00:00.000Z",
        actor: { userId: "20000000-0000-4000-8000-000000000101", memberId },
      })
    );

    expect(response.status).toBe(400);
    expect(recordManualPaymentForCharge).not.toHaveBeenCalled();
  });
});
