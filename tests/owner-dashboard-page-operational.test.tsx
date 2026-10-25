import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  summary: vi.fn(),
  notFound: vi.fn(),
  error: vi.fn(),
  getUser: vi.fn(),
  legacyMemberships: vi.fn(),
  resolveUserHome: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: mocks.getUser,
    },
  }),
}));
vi.mock("@/lib/auth/legacy-academy-access", () => ({
  findLegacyAcademyMemberships: mocks.legacyMemberships,
}));
vi.mock("@/lib/auth/resolve-user-home", () => ({
  resolveUserHome: mocks.resolveUserHome,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.error } }));
vi.mock("@/components/owner-dashboard/OwnerDashboardView", () => ({
  OwnerDashboardView: () => null,
}));
vi.mock("@/modules/owner-dashboard/application/get-owner-dashboard", () => ({
  getOwnerDashboard: mocks.dashboard,
  ownerDashboardQuerySchema: z.object({
    organizationId: z.guid().optional(),
    locationId: z.guid().optional(),
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
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "synthetic-user" } },
    });
    mocks.legacyMemberships.mockResolvedValue([]);
    mocks.resolveUserHome.mockResolvedValue({
      destination: "academy_workspace",
      redirectUrl: "/app/synthetic-legacy-academy/dashboard",
    });
    mocks.dashboard.mockResolvedValue({
      organization: { id: organizationId },
      scope: { locationId },
    });
    mocks.summary.mockResolvedValue({ synthetic: "summary" });
    mocks.notFound.mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });
  });
  it("mantiene la academia legacy antes de consultar un dashboard canónico solicitado", async () => {
    mocks.legacyMemberships.mockResolvedValue([
      { academyId: "synthetic-legacy-academy" },
    ]);
    await expect(
      OwnerDashboardPage({ searchParams: Promise.resolve({ organizationId }) })
    ).rejects.toThrow("REDIRECT:/app/synthetic-legacy-academy/dashboard");
    expect(mocks.resolveUserHome).toHaveBeenCalledWith({
      userId: "synthetic-user",
      email: undefined,
    });
    expect(mocks.dashboard).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
  });
  it("no ofrece alta alternativa a una cuenta legacy bloqueada", async () => {
    mocks.legacyMemberships.mockResolvedValue([
      { academyId: "synthetic-legacy-academy" },
    ]);
    mocks.resolveUserHome.mockResolvedValue({
      destination: "blocked",
      redirectUrl: "/auth/login?error=access_disabled",
    });
    await expect(
      OwnerDashboardPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("REDIRECT:/auth/login?error=access_disabled");
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
  it("un vínculo legacy sin destino autorizado no abre el dashboard nuevo", async () => {
    mocks.legacyMemberships.mockResolvedValue([
      { academyId: "synthetic-legacy-academy" },
    ]);
    mocks.resolveUserHome.mockResolvedValue({
      destination: "global_dashboard",
      redirectUrl: "/dashboard/profile",
    });
    await expect(
      OwnerDashboardPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("REDIRECT:/owner/setup");
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
  it("no convierte un error legacy en alta nueva o panel vacío", async () => {
    mocks.legacyMemberships.mockRejectedValueOnce(
      new Error("Synthetic legacy catalog failure")
    );
    await expect(
      OwnerDashboardPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("Synthetic legacy catalog failure");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
  it("exige identidad autenticada antes de consultar relaciones o datos", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(
      OwnerDashboardPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("REDIRECT:/auth/login?next=/owner");
    expect(mocks.legacyMemberships).not.toHaveBeenCalled();
    expect(mocks.dashboard).not.toHaveBeenCalled();
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
