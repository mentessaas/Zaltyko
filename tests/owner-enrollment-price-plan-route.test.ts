import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  assignEnrollmentPrice: vi.fn(),
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
vi.mock("@/modules/enrollments/application/enrollment-price-service", () => ({
  assignEnrollmentPrice: mocks.assignEnrollmentPrice,
}));

import { PATCH } from "@/app/api/v1/owner/enrollments/[enrollmentId]/price-plan/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const enrollmentId = "30000000-0000-4000-8000-000000000003";
const pricePlanId = "40000000-0000-4000-8000-000000000004";
const userId = "50000000-0000-4000-8000-000000000005";
const memberId = "60000000-0000-4000-8000-000000000006";
const idempotencyKey = "enrollment-price-plan-01";
const params = Promise.resolve({ enrollmentId });
const payload = {
  organizationId,
  locationId,
  pricePlanId,
  startsOn: "2026-10-24",
};

function request(body: unknown = payload, key = idempotencyKey) {
  return new Request(
    `https://example.invalid/api/v1/owner/enrollments/${enrollmentId}/price-plan`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify(body),
    }
  );
}

const context = { params };

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA" },
    member: { id: memberId, role: "owner", locationScopeMode: "all" },
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.assignEnrollmentPrice.mockResolvedValue({
    id: "70000000-0000-4000-8000-000000000007",
    enrollmentId,
    pricePlanId,
    unitAmountCents: 4900,
    currency: "EUR",
    startsOn: payload.startsOn,
    endsOn: null,
  });
});

describe("Owner enrollment price-plan HTTP boundary", () => {
  it("requires a session before parsing or resolving scope", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const malformed = new Request(
      `https://example.invalid/api/v1/owner/enrollments/${enrollmentId}/price-plan`,
      { method: "PATCH", body: "{" }
    );

    const response = await PATCH(malformed, context);

    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.assignEnrollmentPrice).not.toHaveBeenCalled();
  });

  it("rejects invalid enrollment IDs and browser-controlled actor fields", async () => {
    const invalidContext = {
      params: Promise.resolve({ enrollmentId: "bad-id" }),
    };
    const response = await PATCH(
      request({ ...payload, actor: { userId, memberId }, role: "owner" }),
      invalidContext
    );

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.assignEnrollmentPrice).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before assignment", async () => {
    const response = await PATCH(request(payload, ""), context);

    expect(response.status).toBe(400);
    expect(mocks.assignEnrollmentPrice).not.toHaveBeenCalled();
  });

  it("stops before assignment when the requested site is denied", async () => {
    mocks.ownerScope.mockRejectedValueOnce(
      new OperationalError("LOCATION_SCOPE_DENIED", "Site denied", 403)
    );

    const response = await PATCH(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.assignEnrollmentPrice).not.toHaveBeenCalled();
  });

  it("stops before assignment when the verified tenant is rate-limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });

    const response = await PATCH(request(), context);

    expect(response.status).toBe(429);
    expect(mocks.assignEnrollmentPrice).not.toHaveBeenCalled();
  });

  it("derives academy, enrollment and actor from validated input and session", async () => {
    const response = await PATCH(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
    });
    expect(mocks.assignEnrollmentPrice).toHaveBeenCalledWith({
      ...payload,
      enrollmentId,
      idempotencyKey,
      actor: { userId, memberId },
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        enrollmentId,
        pricePlanId,
        unitAmountCents: 4900,
        currency: "EUR",
        startsOn: payload.startsOn,
        endsOn: null,
      },
    });
  });
});
