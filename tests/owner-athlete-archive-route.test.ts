import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  archive: vi.fn(),
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
vi.mock("@/modules/saas-billing/application/owner-access", () => ({
  hasSameOrigin: (request: Request) =>
    request.headers.get("origin") === new URL(request.url).origin,
}));
vi.mock("@/modules/athletes/application/owner-athlete-archive", () => ({
  archiveOwnerAthlete: mocks.archive,
}));

import { POST } from "@/app/api/v1/owner/athletes/[athleteId]/archive/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const athleteId = "10000000-0000-4000-8000-000000000003";
const userId = "10000000-0000-4000-8000-000000000004";
const memberId = "10000000-0000-4000-8000-000000000005";
const idempotencyKey = "owner-athlete-archive-001";
const context = { params: Promise.resolve({ athleteId }) };
const body = { organizationId, locationId };

function request(
  payload: unknown = body,
  key = idempotencyKey,
  origin = "https://sandbox.invalid"
) {
  return new Request(
    `https://sandbox.invalid/api/v1/owner/athletes/${athleteId}/archive`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { "idempotency-key": key } : {}),
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify(payload),
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
  mocks.archive.mockResolvedValue({ athleteId, isActive: false, replayed: false });
});

describe("archivo Owner athlete HTTP", () => {
  it("requires authentication before resolving the organization", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await POST(request(), context);

    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("requires a same-origin cookie mutation", async () => {
    const response = await POST(request(body, idempotencyKey, "https://other.invalid"), context);

    expect(response.status).toBe(403);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("rejects extra client-supplied identity or role fields", async () => {
    const response = await POST(
      request({ ...body, actor: { userId, memberId }, role: "owner" }),
      context
    );

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before calling the service", async () => {
    const response = await POST(request(body, ""), context);

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("derives actor and organization from the authenticated membership", async () => {
    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith({ userId, organizationId });
    expect(mocks.archive).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
      athleteId,
      idempotencyKey,
      actor: { userId, memberId },
    });
    expect(await response.json()).toEqual({
      ok: true,
      data: { athleteId, isActive: false, replayed: false },
    });
  });

  it("preserves service denials for managers or restricted members", async () => {
    mocks.archive.mockRejectedValue(
      new OperationalError("LOCATION_SCOPE_DENIED", "Sede denegada", 403)
    );

    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.archive).toHaveBeenCalledOnce();
  });
});
