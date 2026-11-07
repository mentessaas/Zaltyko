import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
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
vi.mock("@/modules/athletes/application/owner-athlete-profile", () => ({
  getOwnerAthleteProfile: mocks.getProfile,
  updateOwnerAthleteProfile: mocks.updateProfile,
}));

import {
  GET,
  PATCH,
} from "@/app/api/v1/owner/athletes/[athleteId]/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const athleteId = "10000000-0000-4000-8000-000000000003";
const userId = "10000000-0000-4000-8000-000000000004";
const memberId = "10000000-0000-4000-8000-000000000005";
const idempotencyKey = "owner-athlete-profile-001";
const context = { params: Promise.resolve({ athleteId }) };
const updateBody = {
  organizationId,
  locationId,
  expectedGivenName: "Ana",
  expectedFamilyName: "López",
  givenName: "Ana María",
  familyName: "López Ruiz",
};

function getRequest(query = `organizationId=${organizationId}&locationId=${locationId}`) {
  return new Request(
    `https://sandbox.invalid/api/v1/owner/athletes/${athleteId}?${query}`
  );
}

function patchRequest(body: unknown = updateBody, key = idempotencyKey) {
  return new Request(
    `https://sandbox.invalid/api/v1/owner/athletes/${athleteId}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(key ? { "idempotency-key": key } : {}),
      },
      body: JSON.stringify(body),
    }
  );
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA Academy" },
    member: { id: memberId, role: "owner", locationScopeMode: "all" },
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.getProfile.mockResolvedValue({
    athleteId,
    givenName: "Ana",
    familyName: "López",
  });
  mocks.updateProfile.mockResolvedValue({
    athleteId,
    givenName: "Ana María",
    familyName: "López Ruiz",
    replayed: false,
  });
});

describe("Owner athlete profile HTTP boundary", () => {
  it("requires authentication before resolving the organization or profile", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await GET(getRequest(), context);

    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.getProfile).not.toHaveBeenCalled();
  });

  it("reads separate canonical name fields within a validated location", async () => {
    const response = await GET(getRequest(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
    });
    expect(mocks.getProfile).toHaveBeenCalledWith({
      organizationId,
      locationId,
      athleteId,
      actor: { userId, memberId },
    });
    expect(await response.json()).toEqual({
      ok: true,
      data: { athleteId, givenName: "Ana", familyName: "López" },
    });
  });

  it("rejects extra GET scope parameters instead of silently widening the query", async () => {
    const response = await GET(
      getRequest(
        `organizationId=${organizationId}&locationId=${locationId}&allLocations=true`
      ),
      context
    );

    expect(response.status).toBe(400);
    expect(mocks.getProfile).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied actor or role fields", async () => {
    const response = await PATCH(
      patchRequest({ ...updateBody, actor: { userId, memberId }, role: "owner" }),
      context
    );

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before attempting the update", async () => {
    const response = await PATCH(patchRequest(updateBody, ""), context);

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("derives actor and scope from the authenticated session and returns the receipt", async () => {
    const response = await PATCH(patchRequest(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
    });
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      ...updateBody,
      athleteId,
      idempotencyKey,
      actor: { userId, memberId },
    });
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        athleteId,
        givenName: "Ana María",
        familyName: "López Ruiz",
        replayed: false,
      },
    });
  });

  it("preserves server-side location denials", async () => {
    mocks.ownerScope.mockRejectedValueOnce(
      new OperationalError("LOCATION_SCOPE_DENIED", "Sede denegada", 403)
    );

    const response = await PATCH(patchRequest(), context);

    expect(response.status).toBe(403);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});
