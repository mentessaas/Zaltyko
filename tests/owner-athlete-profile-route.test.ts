import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  updateAthleteProfileForGroup: vi.fn(),
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
  updateAthleteProfileForGroup: mocks.updateAthleteProfileForGroup,
}));

import { PATCH } from "@/app/api/v1/owner/groups/[groupId]/athletes/[athleteId]/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const groupId = "20000000-0000-4000-8000-000000000002";
const athleteId = "30000000-0000-4000-8000-000000000003";
const memberId = "40000000-0000-4000-8000-000000000004";
const userId = "50000000-0000-4000-8000-000000000005";
const idempotencyKey = "athlete-profile-update-001";
const profileVersion = "2026-10-13T09:00:00.123456Z";
const body = {
  organizationId,
  givenName: "Ana",
  familyName: "QA",
  preferredName: null,
  expectedProfileVersion: profileVersion,
};

function request(payload: unknown = body, key = idempotencyKey) {
  return new Request(
    `https://example.invalid/api/v1/owner/groups/${groupId}/athletes/${athleteId}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify(payload),
    }
  );
}

function context(overrides: Partial<{ groupId: string; athleteId: string }> = {}) {
  return {
    params: Promise.resolve({ groupId: overrides.groupId ?? groupId, athleteId: overrides.athleteId ?? athleteId }),
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
    member: { id: memberId, role: "owner", locationScopeMode: "all" },
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.updateAthleteProfileForGroup.mockResolvedValue({
    athleteId,
    givenName: "Ana",
    familyName: "QA",
    preferredName: null,
    profileVersion: "2026-10-13T09:01:00.000001Z",
  });
});

describe("Owner athlete profile HTTP boundary", () => {
  it("requires authentication before parsing or resolving the organization", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await PATCH(
      new Request("https://example.invalid/", { method: "PATCH", body: "{" }),
      context()
    );

    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.updateAthleteProfileForGroup).not.toHaveBeenCalled();
  });

  it("rejects malformed IDs, unsupported personal fields, and missing idempotency", async () => {
    expect((await PATCH(request(), context({ athleteId: "not-a-uuid" }))).status).toBe(400);
    expect((await PATCH(request({ ...body, dateOfBirth: "2012-01-01" }))).status).toBe(400);
    expect((await PATCH(request(body, ""))).status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.updateAthleteProfileForGroup).not.toHaveBeenCalled();
  });

  it("uses only the authenticated tenant and route IDs and returns a private no-store receipt", async () => {
    const response = await PATCH(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith({ userId, organizationId });
    expect(mocks.updateAthleteProfileForGroup).toHaveBeenCalledWith({
      ...body,
      groupId,
      athleteId,
      idempotencyKey,
      actor: { userId, memberId },
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { athleteId, givenName: "Ana", familyName: "QA", preferredName: null },
    });
  });

  it("does not call the write service when rate-limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });

    expect((await PATCH(request(), context())).status).toBe(429);
    expect(mocks.updateAthleteProfileForGroup).not.toHaveBeenCalled();
  });

  it("preserves the transactional over-capacity rejection", async () => {
    mocks.updateAthleteProfileForGroup.mockRejectedValueOnce(
      new OperationalError("PLAN_OVER_CAPACITY", "Over capacity", 409)
    );

    const response = await PATCH(request(), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      type: "https://zaltyko.com/problems/plan-over-capacity",
      status: 409,
    });
  });
});
