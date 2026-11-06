import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 30, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (_request: Request, organizationId: string) => `verified:${organizationId}`,
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () => new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.ownerScope }));
vi.mock("@/modules/families/application/owner-guardian-profile", () => ({
  getOwnerGuardianProfile: mocks.getProfile,
  updateOwnerGuardianProfile: mocks.updateProfile,
}));

import { GET, PATCH } from "@/app/api/v1/owner/guardians/[guardianId]/profile/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const guardianId = "10000000-0000-4000-8000-000000000003";
const userId = "10000000-0000-4000-8000-000000000004";
const memberId = "10000000-0000-4000-8000-000000000005";
const updatedAt = "2026-10-25T09:30:00.123456Z";
const idempotencyKey = "owner-guardian-profile-001";
const context = { params: Promise.resolve({ guardianId }) };
const body = {
  organizationId,
  locationId,
  expectedGivenName: "Ana",
  expectedFamilyName: "López",
  expectedUpdatedAt: updatedAt,
  givenName: "Ana María",
  familyName: "López Ruiz",
};

function getRequest(query = `organizationId=${organizationId}&locationId=${locationId}`) {
  return new Request(`https://sandbox.invalid/api/v1/owner/guardians/${guardianId}/profile?${query}`);
}

function patchRequest(payload: unknown = body, key = idempotencyKey, origin: string | null = "https://sandbox.invalid") {
  return new Request(`https://sandbox.invalid/api/v1/owner/guardians/${guardianId}/profile`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(origin === null ? {} : { origin }), ...(key ? { "idempotency-key": key } : {}) },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA Academy" },
    member: { id: memberId, role: "owner", locationScopeMode: "all" },
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.getProfile.mockResolvedValue({ guardianId, givenName: "Ana", familyName: "López", updatedAt });
  mocks.updateProfile.mockResolvedValue({ guardianId, givenName: "Ana María", familyName: "López Ruiz", updatedAt, replayed: false });
});

describe("Owner guardian profile HTTP boundary", () => {
  it.each([null, "https://foreign.invalid", "not-an-origin"])(
    "rejects an untrusted cookie mutation origin before resolving scope: %s",
    async (origin) => {
      const response = await PATCH(patchRequest(body, idempotencyKey, origin), context);
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(mocks.ownerScope).not.toHaveBeenCalled();
      expect(mocks.updateProfile).not.toHaveBeenCalled();
    }
  );

  it("authenticates before resolving scope or profile", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const response = await GET(getRequest(), context);
    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.getProfile).not.toHaveBeenCalled();
  });

  it("returns separated names and an exact database version with private no-store", async () => {
    const response = await GET(getRequest(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getProfile).toHaveBeenCalledWith({ organizationId, locationId, guardianId, actor: { userId, memberId } });
    expect(await response.json()).toEqual({ ok: true, data: { guardianId, givenName: "Ana", familyName: "López", updatedAt } });
  });

  it("rejects extra query parameters and timestamps without six microseconds", async () => {
    const queryResponse = await GET(getRequest(`organizationId=${organizationId}&locationId=${locationId}&allSites=true`), context);
    const bodyResponse = await PATCH(patchRequest({ ...body, expectedUpdatedAt: "2026-10-25T09:30:00.123Z" }), context);
    expect(queryResponse.status).toBe(400);
    expect(bodyResponse.status).toBe(400);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied actor/role fields and requires idempotency", async () => {
    const roleResponse = await PATCH(patchRequest({ ...body, actor: { userId, memberId }, role: "owner" }), context);
    const keyResponse = await PATCH(patchRequest(body, ""), context);
    expect(roleResponse.status).toBe(400);
    expect(keyResponse.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("derives actor from the authenticated session and returns the replay flag", async () => {
    const response = await PATCH(patchRequest(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith({ userId, organizationId, locationId });
    expect(mocks.updateProfile).toHaveBeenCalledWith({ ...body, guardianId, idempotencyKey, actor: { userId, memberId } });
    expect(await response.json()).toEqual({ ok: true, data: { guardianId, givenName: "Ana María", familyName: "López Ruiz", updatedAt, replayed: false } });
  });

  it("preserves a server-side all-site denial", async () => {
    mocks.ownerScope.mockRejectedValueOnce(new OperationalError("LOCATION_SCOPE_DENIED", "Sede denegada", 403));
    const response = await PATCH(patchRequest(), context);
    expect(response.status).toBe(403);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});
