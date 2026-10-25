import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  updateClassDetails: vi.fn(),
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
vi.mock("@/modules/scheduling/application/class-management-service", () => ({
  updateClassDetails: mocks.updateClassDetails,
}));

import { PATCH } from "@/app/api/v1/owner/classes/[classTemplateId]/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const classTemplateId = "20000000-0000-4000-8000-000000000002";
const userId = "30000000-0000-4000-8000-000000000003";
const memberId = "40000000-0000-4000-8000-000000000004";
const expectedUpdatedAt = "2026-10-24T12:00:00.123456Z";
const idempotencyKey = "class-details-update-01";
const body = {
  organizationId,
  expectedUpdatedAt,
  name: "Artística avanzada",
  capacity: 16,
};

function request(payload: unknown = body, key = idempotencyKey) {
  return new Request(
    `https://example.invalid/api/v1/owner/classes/${classTemplateId}`,
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

function context(id = classTemplateId) {
  return { params: Promise.resolve({ classTemplateId: id }) };
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA" },
    member: { id: memberId, role: "owner", locationScopeMode: "all" },
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.updateClassDetails.mockResolvedValue({
    id: classTemplateId,
    name: body.name,
    capacity: body.capacity,
    updatedAtVersion: "2026-10-24T12:00:01.000001Z",
  });
});

describe("Owner class details HTTP boundary", () => {
  it("requires authentication before parsing the body or resolving scope", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const malformed = new Request("https://example.invalid/", {
      method: "PATCH",
      body: "{",
    });

    const response = await PATCH(malformed, context());

    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.updateClassDetails).not.toHaveBeenCalled();
  });

  it.each([
    { caseName: "invalid class id", id: "not-a-uuid", payload: body, key: idempotencyKey },
    { caseName: "extra browser identity", id: classTemplateId, payload: { ...body, actor: { userId, memberId } }, key: idempotencyKey },
    { caseName: "missing version", id: classTemplateId, payload: { organizationId, name: "Changed" }, key: idempotencyKey },
    { caseName: "invalid capacity", id: classTemplateId, payload: { ...body, capacity: 1.5 }, key: idempotencyKey },
    { caseName: "invalid timestamp", id: classTemplateId, payload: { ...body, expectedUpdatedAt: "2026-99-99T99:99:99.123456Z" }, key: idempotencyKey },
    { caseName: "missing idempotency", id: classTemplateId, payload: body, key: "" },
  ])("rejects $caseName before invoking the command", async ({ id, payload, key }) => {
    const response = await PATCH(request(payload, key), context(id));

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.updateClassDetails).not.toHaveBeenCalled();
  });

  it("uses the verified session identity, tenant scope and route ID, then returns a private receipt", async () => {
    const response = await PATCH(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith({ userId, organizationId });
    expect(mocks.updateClassDetails).toHaveBeenCalledWith({
      ...body,
      classTemplateId,
      idempotencyKey,
      actor: { userId, memberId },
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        id: classTemplateId,
        name: body.name,
        capacity: body.capacity,
        updatedAtVersion: "2026-10-24T12:00:01.000001Z",
      },
    });
  });

  it("preserves a capacity rejection without converting it into a success", async () => {
    mocks.updateClassDetails.mockRejectedValueOnce(
      new OperationalError("CAPACITY_FULL", "There are open enrollments", 409)
    );

    const response = await PATCH(request(), context());

    expect(response.status).toBe(409);
    expect(mocks.updateClassDetails).toHaveBeenCalledOnce();
  });

  it("does not invoke the command when tenant rate limiting rejects the request", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });

    const response = await PATCH(request(), context());

    expect(response.status).toBe(429);
    expect(mocks.updateClassDetails).not.toHaveBeenCalled();
  });
});
