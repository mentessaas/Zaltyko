import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  transitionEnrollment: vi.fn(),
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
vi.mock("@/modules/enrollments/application/enrollment-service", () => ({
  transitionEnrollment: mocks.transitionEnrollment,
}));

import { PATCH } from "@/app/api/v1/owner/enrollments/[enrollmentId]/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const enrollmentId = "20000000-0000-4000-8000-000000000002";
const userId = "30000000-0000-4000-8000-000000000003";
const memberId = "40000000-0000-4000-8000-000000000004";
const idempotencyKey = "enrollment-transition-01";
const params = Promise.resolve({ enrollmentId });
const payload = {
  organizationId,
  expectedVersion: 3,
  toStatus: "cancelled",
  effectiveOn: "2026-10-24",
  reasonCode: "family_request",
};

function request(body: unknown = payload, key = idempotencyKey) {
  return new Request(
    `https://example.invalid/api/v1/owner/enrollments/${enrollmentId}`,
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
  mocks.transitionEnrollment.mockResolvedValue({
    id: enrollmentId,
    status: "cancelled",
    startsOn: "2026-09-01",
    endsOn: payload.effectiveOn,
    version: 4,
  });
});

describe("Owner enrollment transition HTTP boundary", () => {
  it("requires the session before parsing or resolving scope", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const malformed = new Request(
      `https://example.invalid/api/v1/owner/enrollments/${enrollmentId}`,
      { method: "PATCH", body: "{" }
    );

    const response = await PATCH(malformed, context);

    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.transitionEnrollment).not.toHaveBeenCalled();
  });

  it("rejects invalid enrollment IDs and browser-supplied identity fields", async () => {
    const invalidContext = {
      params: Promise.resolve({ enrollmentId: "invalid" }),
    };
    const response = await PATCH(
      request({ ...payload, actor: { userId, memberId }, role: "owner" }),
      invalidContext
    );

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.transitionEnrollment).not.toHaveBeenCalled();
  });

  it("requires an idempotency key", async () => {
    const response = await PATCH(request(payload, ""), context);

    expect(response.status).toBe(400);
    expect(mocks.transitionEnrollment).not.toHaveBeenCalled();
  });

  it("preserves stale-version conflicts from the transactional service", async () => {
    mocks.transitionEnrollment.mockRejectedValueOnce(
      new OperationalError("VERSION_CONFLICT", "Stale version", 409)
    );

    const response = await PATCH(request(), context);

    expect(response.status).toBe(409);
    expect(mocks.transitionEnrollment).toHaveBeenCalledTimes(1);
  });

  it("stops before transition when the verified tenant is rate-limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });

    const response = await PATCH(request(), context);

    expect(response.status).toBe(429);
    expect(mocks.transitionEnrollment).not.toHaveBeenCalled();
  });

  it("derives the tenant and actor from the session and returns the new version", async () => {
    const response = await PATCH(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith({ userId, organizationId });
    expect(mocks.transitionEnrollment).toHaveBeenCalledWith({
      organizationId,
      enrollmentId,
      expectedVersion: 3,
      toStatus: "cancelled",
      effectiveOn: payload.effectiveOn,
      reasonCode: "family_request",
      idempotencyKey,
      actor: { userId, memberId },
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { id: enrollmentId, status: "cancelled", version: 4 },
    });
  });
});
