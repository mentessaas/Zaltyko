import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  sameOrigin: vi.fn(),
  resolveOwnerScope: vi.fn(),
  rateLimit: vi.fn(),
  getRegularizationStatus: vi.fn(),
  archiveResource: vi.fn(),
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
vi.mock("@/modules/saas-billing/application/owner-access", () => ({
  hasSameOrigin: mocks.sameOrigin,
  resolveSaasOwnerScope: mocks.resolveOwnerScope,
}));
vi.mock("@/modules/saas-billing/application/regularization-service", () => ({
  getRegularizationStatus: mocks.getRegularizationStatus,
  archiveResource: mocks.archiveResource,
}));

import {
  GET,
  POST,
} from "@/app/api/v1/owner/saas/usage/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const resourceId = "20000000-0000-4000-8000-000000000002";
const userId = "30000000-0000-4000-8000-000000000003";
const idempotencyKey = "qa-archive-athlete-01";
const readOnlyStatus = {
  planCode: "free",
  readOnly: true,
  resources: [
    { resource: "athletes", current: 31, limit: 30, excess: 1 },
    { resource: "groups", current: 4, limit: 3, excess: 1 },
    { resource: "classes", current: 11, limit: 10, excess: 1 },
  ],
  items: [{ id: resourceId, resource: "athletes", label: "QA Athlete" }],
  next: null,
};

function getRequest(query = `organizationId=${organizationId}`) {
  return new Request(`https://example.invalid/api/v1/owner/saas/usage?${query}`);
}

function postRequest(body: unknown, key = idempotencyKey) {
  return new Request("https://example.invalid/api/v1/owner/saas/usage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.sameOrigin.mockReturnValue(true);
  mocks.resolveOwnerScope.mockResolvedValue({ organizationId });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.getRegularizationStatus.mockResolvedValue(readOnlyStatus);
  mocks.archiveResource.mockResolvedValue({
    ...readOnlyStatus,
    readOnly: false,
    resources: readOnlyStatus.resources.map((item) =>
      item.resource === "athletes"
        ? { ...item, current: 30, excess: 0 }
        : item
    ),
  });
});

describe("Owner SaaS usage and regularization HTTP boundary", () => {
  it("requires authentication before reading the regularization status", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
    expect(mocks.getRegularizationStatus).not.toHaveBeenCalled();
  });

  it("returns server-calculated excess while preserving private no-store", async () => {
    const response = await GET(
      getRequest(`organizationId=${organizationId}&resource=athletes`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.resolveOwnerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
    });
    expect(mocks.getRegularizationStatus).toHaveBeenCalledWith({
      organizationId,
      resource: "athletes",
      userId,
    });
    expect(await response.json()).toMatchObject({
      data: { readOnly: true, resources: readOnlyStatus.resources },
    });
  });

  it("rejects an invalid regularization query before resolving scope", async () => {
    const response = await GET(
      getRequest(`organizationId=${organizationId}&resource=payments`)
    );

    expect(response.status).toBe(400);
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
  });

  it("requires same-origin confirmation before parsing an archive command", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    const malformed = new Request(
      "https://example.invalid/api/v1/owner/saas/usage",
      { method: "POST", body: "{" }
    );

    const response = await POST(malformed);

    expect(response.status).toBe(403);
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
    expect(mocks.archiveResource).not.toHaveBeenCalled();
  });

  it("requires explicit archive confirmation, a strict resource command and an idempotency key", async () => {
    const invalid = await POST(
      postRequest({
        organizationId,
        resource: "athletes",
        resourceId,
        confirmArchive: false,
        readOnly: false,
      })
    );

    expect(invalid.status).toBe(400);
    expect(mocks.archiveResource).not.toHaveBeenCalled();

    const noKey = await POST(postRequest({
      organizationId,
      resource: "athletes",
      resourceId,
      confirmArchive: true,
    }, ""));

    expect(noKey.status).toBe(400);
    expect(mocks.archiveResource).not.toHaveBeenCalled();
  });

  it("stops before archive on rate limit and returns updated server usage after an authorized archive", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });
    const body = {
      organizationId,
      resource: "athletes",
      resourceId,
      confirmArchive: true,
    };

    const limited = await POST(postRequest(body));

    expect(limited.status).toBe(429);
    expect(mocks.archiveResource).not.toHaveBeenCalled();

    const response = await POST(postRequest(body));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.archiveResource).toHaveBeenCalledWith({
      ...body,
      userId,
      idempotencyKey,
    });
    expect(await response.json()).toMatchObject({
      data: { readOnly: false },
    });
  });

  it("preserves an authorization denial from the archive service", async () => {
    mocks.archiveResource.mockRejectedValueOnce(
      new OperationalError("FORBIDDEN", "Owner required", 403)
    );

    const response = await POST(
      postRequest({
        organizationId,
        resource: "athletes",
        resourceId,
        confirmArchive: true,
      })
    );

    expect(response.status).toBe(403);
  });
});
