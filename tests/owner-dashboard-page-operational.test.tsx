import { Children, isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const mocks = vi.hoisted(() => ({
  scope: vi.fn(),
  dashboard: vi.fn(),
  summary: vi.fn(),
  today: vi.fn(),
  attention: vi.fn(),
  setup: vi.fn(),
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
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.scope,
}));
vi.mock("@/modules/owner-dashboard/application/get-owner-dashboard", () => ({
  getOwnerDashboard: mocks.dashboard,
}));
vi.mock("@/modules/owner-dashboard/application/operational-summary", () => ({
  getOwnerOperationalSummary: mocks.summary,
  ownerOperationalSummaryQuerySchema: z.object({
    organizationId: z.guid().optional(),
    locationId: z.guid().optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  }),
}));
vi.mock("@/modules/owner-dashboard/application/today-sessions", () => ({
  getOwnerTodaySessions: mocks.today,
}));
vi.mock("@/modules/owner-dashboard/application/attention-items", () => ({
  getOwnerAttentionItems: mocks.attention,
}));
vi.mock("@/modules/owner-dashboard/application/setup-checklist", () => ({
  getOwnerSetupProgress: mocks.setup,
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
import { OwnerProductDiscovery } from "@/components/owner-dashboard/OwnerProductDiscovery";
const organizationId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000002";

function operationalSummaryFromPage(page: ReactElement) {
  const dashboard = Children.toArray(page.props.children)[0];
  if (!isValidElement<{ operationalSummary: unknown }>(dashboard)) {
    throw new Error("Owner dashboard child is missing");
  }
  return dashboard.props.operationalSummary;
}

describe("Owner page operational summary boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "synthetic-user" } },
    });
    mocks.legacyMemberships.mockResolvedValue([]);
    mocks.resolveUserHome.mockResolvedValue({
      destination: "academy_workspace",
      redirectUrl: "/owner",
    });
    mocks.scope.mockResolvedValue({
      organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
      member: { id: "synthetic-member", role: "owner", locationScopeMode: "all" },
      locations: [{ id: locationId, name: "Sede QA" }],
      selectedLocationId: null,
      canViewOrganizationAggregate: true,
    });
    mocks.summary.mockResolvedValue({ synthetic: "summary" });
    mocks.today.mockResolvedValue({ sessions: [], truncated: false });
    mocks.attention.mockResolvedValue({ unrecordedSessions: { count: 0, latest: null }, fullClasses: 0, overdueInvoices: 0 });
    mocks.setup.mockResolvedValue({ synthetic: "setup" });
    mocks.notFound.mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });
  });
  it("una academia legacy verificada ya no redirige a /app: sigue por el flujo canónico", async () => {
    mocks.legacyMemberships.mockResolvedValue([
      { academyId: "synthetic-legacy-academy" },
    ]);
    await OwnerDashboardPage({ searchParams: Promise.resolve({ organizationId }) });
    expect(mocks.resolveUserHome).toHaveBeenCalledWith({
      userId: "synthetic-user",
      email: undefined,
    });
    expect(mocks.redirect).not.toHaveBeenCalledWith(expect.stringContaining("/app/"));
    expect(mocks.summary).toHaveBeenCalled();
  });
  it("un padre con vínculo legacy va a /familia y no a /owner/setup", async () => {
    mocks.legacyMemberships.mockResolvedValue([
      { academyId: "synthetic-legacy-academy" },
    ]);
    mocks.resolveUserHome.mockResolvedValue({
      destination: "academy_workspace",
      redirectUrl: "/familia",
    });
    await expect(
      OwnerDashboardPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("REDIRECT:/familia");
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
  it("does not silently narrow an organization aggregate to a default site", async () => {
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
    expect(operationalSummaryFromPage(page)).toEqual({ synthetic: "summary" });
    expect(mocks.scope).toHaveBeenCalledWith({
      userId: "synthetic-user",
      organizationId,
      surface: "coach_operations",
    });
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
  it("envía al coach a Pasar lista (su Hoy) sin calcular el Resumen de la organización", async () => {
    mocks.scope.mockResolvedValue({
      organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
      member: { id: "synthetic-coach", role: "coach", locationScopeMode: "selected" },
      locations: [{ id: locationId, name: "Sede QA" }],
      selectedLocationId: locationId,
      canViewOrganizationAggregate: false,
    });

    await expect(
      OwnerDashboardPage({ searchParams: Promise.resolve({ organizationId }) })
    ).rejects.toThrow(
      `REDIRECT:/owner/attendance?organizationId=${organizationId}&locationId=${locationId}`
    );
    expect(mocks.summary).not.toHaveBeenCalled();
    expect(mocks.today).not.toHaveBeenCalled();
    expect(mocks.attention).not.toHaveBeenCalled();
  });
  it("un coach sin sedes va a Pasar lista, donde se le explica, y no a crear academia", async () => {
    mocks.scope.mockRejectedValue(
      new OperationalError("LOCATION_SCOPE_DENIED", "Sin sedes asignadas", 403, {
        reason: "coach_without_locations",
        organizationId,
      })
    );

    await expect(
      OwnerDashboardPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(`REDIRECT:/owner/attendance?organizationId=${organizationId}`);
    expect(mocks.summary).not.toHaveBeenCalled();
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
  it("binds proposals to the server-authorized academy, role and selected site", async () => {
    mocks.scope.mockResolvedValueOnce({
      organization: { id: organizationId, name: "QA", defaultCurrency: "MXN" },
      member: { id: "scoped-member", role: "manager", locationScopeMode: "selected" },
      locations: [{ id: locationId, name: "Sede autorizada" }],
      selectedLocationId: locationId,
      canViewOrganizationAggregate: false,
    });
    const page = await OwnerDashboardPage({ searchParams: Promise.resolve({ organizationId }) });
    const discovery = Children.toArray(page.props.children).find(child => isValidElement(child) && child.type === OwnerProductDiscovery);
    expect(isValidElement(discovery) && discovery.props).toEqual({ organizationId, locationId, role: "manager" });
  });
  it("loads today sessions with the same server-authorized scope and selected site", async () => {
    const page = await OwnerDashboardPage({
      searchParams: Promise.resolve({ organizationId, locationId }),
    });
    const scope = await mocks.scope.mock.results[0]?.value;
    expect(mocks.today).toHaveBeenCalledWith({ scope, locationId });
    const dashboard = Children.toArray(page.props.children)[0];
    expect(isValidElement<{ todaySessions: unknown }>(dashboard) && dashboard.props.todaySessions).toEqual({ sessions: [], truncated: false });
  });
  it("shows today sessions as unavailable instead of an empty day when the query fails", async () => {
    mocks.today.mockRejectedValue(new Error("Synthetic sessions failure"));
    const page = await OwnerDashboardPage({
      searchParams: Promise.resolve({ organizationId }),
    });
    const dashboard = Children.toArray(page.props.children)[0];
    expect(isValidElement<{ todaySessions: unknown }>(dashboard) && dashboard.props.todaySessions).toBeNull();
    expect(operationalSummaryFromPage(page)).toEqual({ synthetic: "summary" });
    expect(mocks.error).toHaveBeenCalledOnce();
  });
  it("only counts overdue invoices for roles that can see finances", async () => {
    await OwnerDashboardPage({ searchParams: Promise.resolve({ organizationId }) });
    expect(mocks.attention).toHaveBeenLastCalledWith(expect.objectContaining({ includeFinancials: true }));
    // A manager reaches the Resumen but cannot see finances (coaches are redirected first).
    mocks.scope.mockResolvedValueOnce({
      organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
      member: { id: "manager-member", role: "manager", locationScopeMode: "selected" },
      locations: [{ id: locationId, name: "Sede QA" }],
      selectedLocationId: locationId,
      canViewOrganizationAggregate: false,
    });
    await OwnerDashboardPage({ searchParams: Promise.resolve({ organizationId }) });
    expect(mocks.attention).toHaveBeenLastCalledWith(expect.objectContaining({ includeFinancials: false }));
  });
  it("shows attention items as unavailable when their query fails", async () => {
    mocks.attention.mockRejectedValue(new Error("Synthetic attention failure"));
    const page = await OwnerDashboardPage({ searchParams: Promise.resolve({ organizationId }) });
    const dashboard = Children.toArray(page.props.children)[0];
    expect(isValidElement<{ attentionItems: unknown }>(dashboard) && dashboard.props.attentionItems).toBeNull();
    expect(mocks.error).toHaveBeenCalledOnce();
  });
  it("loads the setup checklist with the same server-authorized scope and selected site", async () => {
    const page = await OwnerDashboardPage({
      searchParams: Promise.resolve({ organizationId, locationId }),
    });
    const scope = await mocks.scope.mock.results[0]?.value;
    expect(mocks.setup).toHaveBeenCalledWith({ scope, locationId });
    const dashboard = Children.toArray(page.props.children)[0];
    expect(isValidElement<{ setupProgress: unknown }>(dashboard) && dashboard.props.setupProgress).toEqual({ synthetic: "setup" });
  });
  it("omits the setup checklist when its query fails without blocking the rest of the Resumen", async () => {
    mocks.setup.mockRejectedValue(new Error("Synthetic setup failure"));
    const page = await OwnerDashboardPage({ searchParams: Promise.resolve({ organizationId }) });
    const dashboard = Children.toArray(page.props.children)[0];
    expect(isValidElement<{ setupProgress: unknown; todaySessions: unknown; attentionItems: unknown }>(dashboard) && dashboard.props).toMatchObject({
      setupProgress: null,
      todaySessions: { sessions: [], truncated: false },
      attentionItems: { fullClasses: 0 },
    });
    expect(operationalSummaryFromPage(page)).toEqual({ synthetic: "summary" });
    expect(mocks.error).toHaveBeenCalledOnce();
  });
  it("does not query the setup checklist for roles outside owner, admin and manager", async () => {
    mocks.scope.mockResolvedValueOnce({
      organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
      member: { id: "coach-member", role: "coach", locationScopeMode: "selected" },
      locations: [{ id: locationId, name: "Sede QA" }],
      selectedLocationId: locationId,
      canViewOrganizationAggregate: false,
    });
    // coach is the only role outside owner/admin/manager; P1 #8 sends it to Pasar lista first.
    await expect(
      OwnerDashboardPage({ searchParams: Promise.resolve({ organizationId }) })
    ).rejects.toThrow("REDIRECT:/owner/attendance?");
    expect(mocks.setup).not.toHaveBeenCalled();
  });
  it("exposes a failed summary as unavailable rather than financial zero", async () => {
    mocks.summary.mockRejectedValue(new Error("Synthetic database failure"));
    const page = await OwnerDashboardPage({
      searchParams: Promise.resolve({ organizationId }),
    });
    expect(operationalSummaryFromPage(page)).toBeNull();
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
  it("rejects an unauthorized academy before loading its summary", async () => {
    mocks.scope.mockRejectedValueOnce(new OperationalError("FORBIDDEN", "denied", 403));
    await expect(OwnerDashboardPage({ searchParams: Promise.resolve({ organizationId }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.summary).not.toHaveBeenCalled();
  });
  it("sends a user without canonical membership to setup", async () => {
    mocks.scope.mockRejectedValueOnce(new OperationalError("FORBIDDEN", "denied", 403));
    await expect(OwnerDashboardPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/owner/setup");
    expect(mocks.summary).not.toHaveBeenCalled();
  });
  it("rejects an invalid date before loading scope or data", async () => {
    await expect(OwnerDashboardPage({ searchParams: Promise.resolve({ organizationId, from: "invalid" }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
  });
});
