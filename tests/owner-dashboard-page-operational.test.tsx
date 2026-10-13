import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  summary: vi.fn(),
  notFound: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: mocks.notFound,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "synthetic-user" } } }),
    },
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.error } }));
vi.mock("@/components/owner-dashboard/OwnerDashboardView", () => ({
  OwnerDashboardView: () => null,
}));
vi.mock("@/modules/owner-dashboard/application/get-owner-dashboard", () => ({
  getOwnerDashboard: mocks.dashboard,
  ownerDashboardQuerySchema: z.object({
    organizationId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    programId: z.string().optional(),
    groupId: z.string().optional(),
  }),
}));
vi.mock("@/modules/owner-dashboard/application/operational-summary", () => ({
  getOwnerOperationalSummary: mocks.summary,
}));
vi.mock("@/modules/owner-dashboard/application/capacity-heatmap", () => ({
  getCapacityHeatmap: async () => null,
}));
vi.mock("@/modules/owner-dashboard/application/retention-cohorts", () => ({
  getRetentionCohorts: async () => null,
}));
vi.mock(
  "@/modules/owner-dashboard/application/dashboard-filter-options",
  () => ({
    getOwnerDashboardFilterOptions: async () => ({ programs: [], groups: [] }),
  })
);
vi.mock("@/modules/owner-dashboard/application/dashboard-layout", () => ({
  getOwnerDashboardLayout: async () => null,
}));

import OwnerDashboardPage from "@/app/owner/page";
const organizationId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000002";
describe("Owner page operational summary boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dashboard.mockResolvedValue({
      organization: { id: organizationId },
      scope: { locationId },
    });
    mocks.summary.mockResolvedValue({ synthetic: "summary" });
    mocks.notFound.mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });
  });
  it("does not silently narrow an organization aggregate to the score's default site", async () => {
    const page = await OwnerDashboardPage({
      searchParams: Promise.resolve({ organizationId }),
    });
    expect(mocks.summary).toHaveBeenCalledWith({
      userId: "synthetic-user",
      organizationId,
      locationId: undefined,
      from: undefined,
      to: undefined,
    });
    expect(page.props.operationalSummary).toEqual({ synthetic: "summary" });
  });
  it("passes selected site and dates, but not program/group filters", async () => {
    await OwnerDashboardPage({
      searchParams: Promise.resolve({
        organizationId,
        locationId,
        from: "2026-10-01",
        to: "2026-10-14",
        programId: "synthetic-program",
        groupId: "synthetic-group",
      }),
    });
    expect(mocks.summary).toHaveBeenCalledWith({
      userId: "synthetic-user",
      organizationId,
      locationId,
      from: "2026-10-01",
      to: "2026-10-14",
    });
  });
  it("exposes a failed summary as unavailable rather than financial zero", async () => {
    mocks.summary.mockRejectedValue(new Error("Synthetic database failure"));
    const page = await OwnerDashboardPage({
      searchParams: Promise.resolve({ organizationId }),
    });
    expect(page.props.operationalSummary).toBeNull();
    expect(mocks.error).toHaveBeenCalledOnce();
  });
  it("does not hide a forbidden site as an empty summary", async () => {
    mocks.summary.mockRejectedValue(
      new OperationalError("LOCATION_SCOPE_DENIED", "Synthetic denial", 403)
    );
    await expect(
      OwnerDashboardPage({
        searchParams: Promise.resolve({ organizationId, locationId }),
      })
    ).rejects.toThrow("NOT_FOUND");
  });
});
