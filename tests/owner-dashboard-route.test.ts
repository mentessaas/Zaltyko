import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  getOwnerDashboard: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.currentUser,
}));
vi.mock(
  "@/modules/owner-dashboard/application/get-owner-dashboard",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/modules/owner-dashboard/application/get-owner-dashboard")
    >()),
    getOwnerDashboard: mocks.getOwnerDashboard,
  })
);

import { GET } from "@/app/api/v1/owner/dashboard/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const userId = "30000000-0000-4000-8000-000000000003";
const from = "2026-09-01";
const to = "2026-09-30";
const bundle = {
  state: "ready",
  organization: { id: organizationId, name: "QA Academy" },
  scope: {
    locationId,
    locations: [{ id: locationId, name: "Centro" }],
    canViewOrganizationAggregate: false,
    canManageHealthScore: true,
  },
  period: { start: from, end: to },
  availablePeriods: [],
  score: null,
  scoreComparison: null,
  dimensions: [],
  metrics: [{ key: "paid", value: 1200 }],
  priorities: [],
  scoreTrend: [],
  freshness: { state: "fresh" },
};

function request(query = "") {
  return new Request(`https://example.invalid/api/v1/owner/dashboard${query}`);
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.getOwnerDashboard.mockResolvedValue(bundle);
});

describe("Owner dashboard HTTP boundary", () => {
  it("requires a session before validating query parameters", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await GET(request("?from=invalid"));

    expect(response.status).toBe(401);
    expect(mocks.getOwnerDashboard).not.toHaveBeenCalled();
  });

  it.each([
    "?from=2026-09-01",
    "?from=2026-10-01&to=2026-09-01",
  ])("rejects an incomplete or inverted period: %s", async (query) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(mocks.getOwnerDashboard).not.toHaveBeenCalled();
  });

  it("passes the authenticated user and validated academy, site and period", async () => {
    const response = await GET(
      request(
        `?organization_id=${organizationId}&location_id=${locationId}&from=${from}&to=${to}`
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getOwnerDashboard).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
      from,
      to,
    });
    expect(await response.json()).toEqual(bundle);
  });

  it("preserves server-side scope denials", async () => {
    mocks.getOwnerDashboard.mockRejectedValueOnce(
      new OperationalError("LOCATION_SCOPE_DENIED", "Site denied", 403)
    );

    const response = await GET(
      request(`?organization_id=${organizationId}&location_id=${locationId}`)
    );

    expect(response.status).toBe(403);
  });
});
