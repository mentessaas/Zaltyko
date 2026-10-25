import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  updateOperationalGroupDetails: vi.fn(),
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
vi.mock("@/modules/groups/application/group-management-service", () => ({
  updateOperationalGroupDetails: mocks.updateOperationalGroupDetails,
}));

import { PATCH } from "@/app/api/v1/owner/groups/[groupId]/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const groupId = "20000000-0000-4000-8000-000000000002";
const userId = "30000000-0000-4000-8000-000000000003";
const memberId = "40000000-0000-4000-8000-000000000004";
const idempotencyKey = "owner-group-update-command-01";
const expectedUpdatedAt = "2026-10-25T09:00:00.123456Z";
const body = {
  organizationId,
  expectedUpdatedAt,
  name: "Equipo juvenil",
  capacity: 18,
};

function request(value: unknown = body, key = idempotencyKey) {
  return new Request(
    `https://example.invalid/api/v1/owner/groups/${groupId}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify(value),
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
  mocks.updateOperationalGroupDetails.mockResolvedValue({
    id: groupId,
    name: body.name,
    capacity: body.capacity,
    updatedAtVersion: "2026-10-25T09:01:00.000001Z",
  });
});

describe("Owner group details HTTP boundary", () => {
  it("requires authentication before parsing or resolving tenant scope", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const malformed = new Request(
      `https://example.invalid/api/v1/owner/groups/${groupId}`,
      { method: "PATCH", body: "{" }
    );

    const response = await PATCH(malformed, context());

    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.updateOperationalGroupDetails).not.toHaveBeenCalled();
  });

  it("rejects extra actor fields, missing changes, invalid capacity, and IDs", async () => {
    expect((await PATCH(request(), context("not-a-uuid"))).status).toBe(400);
    expect(
      (await PATCH(request({ organizationId, expectedUpdatedAt }), context())).status
    ).toBe(400);
    expect(
      (await PATCH(request({ ...body, capacity: 0 }), context())).status
    ).toBe(400);

    const response = await PATCH(
      request({ ...body, actor: { userId, memberId }, role: "owner" }),
      context()
    );

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.updateOperationalGroupDetails).not.toHaveBeenCalled();
  });

  it("requires an idempotency key", async () => {
    const response = await PATCH(request(body, ""), context());

    expect(response.status).toBe(400);
    expect(mocks.updateOperationalGroupDetails).not.toHaveBeenCalled();
  });

  it("stops before the command when the authenticated owner scope is denied", async () => {
    mocks.ownerScope.mockRejectedValueOnce(
      new OperationalError("FORBIDDEN", "Scope denied", 403)
    );

    const response = await PATCH(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.updateOperationalGroupDetails).not.toHaveBeenCalled();
  });

  it("does not call the write service while rate-limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });

    const response = await PATCH(request(), context());

    expect(response.status).toBe(429);
    expect(mocks.updateOperationalGroupDetails).not.toHaveBeenCalled();
  });

  it("derives actor and tenant from the authenticated scope and returns a private receipt", async () => {
    const response = await PATCH(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith({ userId, organizationId });
    expect(mocks.updateOperationalGroupDetails).toHaveBeenCalledWith({
      ...body,
      groupId,
      idempotencyKey,
      actor: { userId, memberId },
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        id: groupId,
        name: body.name,
        capacity: body.capacity,
        updatedAtVersion: "2026-10-25T09:01:00.000001Z",
      },
    });
  });

  it("preserves transactional capacity conflicts as problem responses", async () => {
    mocks.updateOperationalGroupDetails.mockRejectedValueOnce(
      new OperationalError(
        "GROUP_CAPACITY_BELOW_OCCUPANCY",
        "Capacity below occupancy",
        409
      )
    );

    const response = await PATCH(request({ ...body, capacity: 1 }), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ status: 409 });
  });
});
