import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  rateLimit: vi.fn(),
  resolveOwnerScope: vi.fn(),
  getOptions: vi.fn(),
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
  resolveOwnerScope: mocks.resolveOwnerScope,
}));
vi.mock("@/modules/attendance/application/owner-attendance-sessions", () => ({
  getOwnerAttendanceSessionOptions: mocks.getOptions,
}));

import { GET } from "@/app/api/v1/owner/attendance/sessions/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const sessionId = "30000000-0000-4000-8000-000000000003";
const userId = "50000000-0000-4000-8000-000000000005";
const memberId = "60000000-0000-4000-8000-000000000006";
const cursor = Buffer.from("untrusted-position", "utf8").toString("base64url");

function request(query = "organizationId=bad&locationId=bad") {
  return new Request(
    `https://example.invalid/api/v1/owner/attendance/sessions?${query}`
  );
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.resolveOwnerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
    member: { id: memberId, role: "owner", locationScopeMode: "all" },
    locations: [{ id: locationId, name: "Main" }],
    selectedLocationId: locationId,
    canViewOrganizationAggregate: true,
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.getOptions.mockResolvedValue({
    organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
    locationId,
    sessions: [],
    nextCursor: null,
    selectedSession: null,
  });
});

describe("Owner attendance session pagination route", () => {
  it("requires a verified user before validating query parameters", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
    expect(mocks.getOptions).not.toHaveBeenCalled();
  });

  it("rejects invalid or unknown query fields before scope or page lookup", async () => {
    const response = await GET(
      request(`organizationId=${organizationId}&locationId=${locationId}&limit=500`)
    );

    expect(response.status).toBe(400);
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
    expect(mocks.getOptions).not.toHaveBeenCalled();
  });

  it("reauthorizes the explicit site, rate-limits the verified tenant, and returns a private no-store page", async () => {
    const response = await GET(
      request(
        `organizationId=${organizationId}&locationId=${locationId}&cursor=${cursor}&sessionId=${sessionId}`
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.resolveOwnerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
    });
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: `verified:${organizationId}` })
    );
    expect(mocks.getOptions).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
      sessionId,
      cursor,
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { sessions: [], nextCursor: null, selectedSession: null },
    });
  });

  it("stops before page lookup when the resolved site is outside the actor scope", async () => {
    mocks.resolveOwnerScope.mockRejectedValueOnce(
      new OperationalError("LOCATION_SCOPE_DENIED", "Site denied", 403)
    );

    const response = await GET(
      request(`organizationId=${organizationId}&locationId=${locationId}`)
    );

    expect(response.status).toBe(403);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.getOptions).not.toHaveBeenCalled();
  });

  it("stops before loading rows when the tenant is rate-limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });

    const response = await GET(
      request(`organizationId=${organizationId}&locationId=${locationId}`)
    );

    expect(response.status).toBe(429);
    expect(mocks.getOptions).not.toHaveBeenCalled();
  });
});
