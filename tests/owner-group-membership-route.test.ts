import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  createAthleteForGroup: vi.fn(),
  addGroupMembership: vi.fn(),
  searchGroupAthleteOptions: vi.fn(),
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
vi.mock("@/modules/groups/application/group-membership-service", () => ({
  createAthleteForGroup: mocks.createAthleteForGroup,
  addGroupMembership: mocks.addGroupMembership,
}));
vi.mock("@/modules/groups/application/group-management-service", () => ({
  searchGroupAthleteOptions: mocks.searchGroupAthleteOptions,
}));

import { POST } from "@/app/api/v1/owner/groups/[groupId]/memberships/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const groupId = "20000000-0000-4000-8000-000000000002";
const memberId = "30000000-0000-4000-8000-000000000003";
const userId = "40000000-0000-4000-8000-000000000004";
const membershipId = "50000000-0000-4000-8000-000000000005";
const athleteId = "60000000-0000-4000-8000-000000000006";
const idempotencyKey = "new-group-athlete-command-01";
const payload = {
  organizationId,
  newAthlete: { givenName: "Ana", familyName: "QA" },
};

function request(body: unknown = payload, key = idempotencyKey) {
  return new Request(
    `https://example.invalid/api/v1/owner/groups/${groupId}/memberships`,
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

function context(id = groupId) {
  return { params: Promise.resolve({ groupId: id }) };
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
    member: { id: memberId, role: "owner", locationScopeMode: "all" },
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.createAthleteForGroup.mockResolvedValue({
    id: membershipId,
    groupId,
    athleteId,
    startsOn: "2026-10-24",
    status: "active",
  });
});

describe("Owner create-athlete-in-group HTTP boundary", () => {
  it("requires authentication before parsing or resolving the group", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const malformed = new Request(
      `https://example.invalid/api/v1/owner/groups/${groupId}/memberships`,
      { method: "POST", body: "{" }
    );

    const response = await POST(malformed, context());

    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.createAthleteForGroup).not.toHaveBeenCalled();
  });

  it("rejects malformed group IDs and browser-supplied actor/role fields", async () => {
    expect((await POST(request(), context("not-a-uuid"))).status).toBe(400);

    const response = await POST(
      request({
        ...payload,
        actor: { userId, memberId },
        role: "owner",
      }),
      context()
    );

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.createAthleteForGroup).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before invoking the capacity write", async () => {
    const response = await POST(request(payload, ""), context());

    expect(response.status).toBe(400);
    expect(mocks.createAthleteForGroup).not.toHaveBeenCalled();
  });

  it("stops before creation when authenticated tenant scope is denied", async () => {
    mocks.ownerScope.mockRejectedValueOnce(
      new OperationalError("FORBIDDEN", "Scope denied", 403)
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.createAthleteForGroup).not.toHaveBeenCalled();
  });

  it("does not invoke the write service when rate-limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });

    const response = await POST(request(), context());

    expect(response.status).toBe(429);
    expect(mocks.createAthleteForGroup).not.toHaveBeenCalled();
  });

  it("preserves the server capacity rejection without returning a receipt", async () => {
    mocks.createAthleteForGroup.mockRejectedValueOnce(
      new OperationalError("PLAN_OVER_CAPACITY", "Over capacity", 409)
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      type: "https://zaltyko.com/problems/plan-over-capacity",
      status: 409,
    });
  });

  it("uses the route group and authenticated scope for the new-athlete command", async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith({ userId, organizationId });
    expect(mocks.createAthleteForGroup).toHaveBeenCalledWith({
      organizationId,
      groupId,
      givenName: "Ana",
      familyName: "QA",
      idempotencyKey,
      actor: { userId, memberId },
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { id: membershipId, groupId, athleteId, status: "active" },
    });
    expect(mocks.addGroupMembership).not.toHaveBeenCalled();
  });
});
