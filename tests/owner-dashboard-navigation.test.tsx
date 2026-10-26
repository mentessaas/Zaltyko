/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import { OwnerDashboardView } from "@/components/owner-dashboard/OwnerDashboardView";
import { OwnerWorkspaceNavigation } from "@/components/owner-dashboard/OwnerWorkspaceNavigation";
import type { OwnerDashboardBundle } from "@/modules/owner-dashboard/application/get-owner-dashboard";

const organizationId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000002";
const searchParams = vi.hoisted(() => new URLSearchParams());
const routeState = vi.hoisted(() => ({ pathname: "/owner" }));

vi.mock("next/navigation", () => ({
  usePathname: () => routeState.pathname,
  useSearchParams: () => searchParams,
}));

const emptyBundle: OwnerDashboardBundle = {
  state: "empty",
  organization: { id: organizationId, name: "Academia sintética" },
  scope: {
    locationId: null,
    locations: [],
    canViewOrganizationAggregate: true,
    canManageHealthScore: true,
  },
  period: null,
  availablePeriods: [],
  score: null,
  scoreComparison: null,
  dimensions: [],
  metrics: [],
  priorities: [],
  scoreTrend: [],
  freshness: {
    status: "current",
    pendingEventCount: 0,
    processingEventCount: 0,
    failedEventCount: 0,
    oldestUnsettledAt: null,
    oldestUnsettledAgeSeconds: null,
    slaSeconds: 900,
  },
};

function renderOwnerWorkspace() {
  return render(
    <>
      <OwnerWorkspaceNavigation />
      <div id="owner-workspace-content">
        <OwnerDashboardView bundle={emptyBundle} />
      </div>
    </>
  );
}

describe("Owner dashboard navigation", () => {
  beforeEach(() => {
    routeState.pathname = "/owner";
    searchParams.set("organizationId", organizationId);
    searchParams.set("locationId", locationId);
  });

  it("keeps module navigation available when the academy has no metrics yet", () => {
    renderOwnerWorkspace();

    const desktopNavigation = screen.getByRole("navigation", {
      name: "Principal",
    });
    expect(within(desktopNavigation).queryByRole("link", { name: /Insights|Capacidad|Health Score|Retención/i })).not.toBeInTheDocument();
    expect(
      within(desktopNavigation).getByRole("link", { name: "Resumen" })
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(desktopNavigation).getByRole("link", { name: "Grupos" })
    ).toHaveAttribute(
      "href",
      `/owner/groups?organizationId=${organizationId}&locationId=${locationId}`
    );
    expect(
      within(desktopNavigation).getByRole("link", { name: "Inscripciones" })
    ).toHaveAttribute(
      "href",
      `/owner/enrollments?organizationId=${organizationId}&locationId=${locationId}`
    );
    expect(
      screen.getByRole("link", { name: "Saltar al contenido" })
    ).toHaveAttribute("href", "#owner-workspace-content");
  });

  it("keeps primary tasks on mobile and exposes secondary modules in a native disclosure", () => {
    renderOwnerWorkspace();

    const mobileNavigation = screen.getByRole("navigation", {
      name: "Navegación móvil",
    });
    for (const label of [
      "Resumen",
      "Grupos",
      "Clases",
      "Inscripciones",
      "Asistencia",
    ]) {
      expect(
        within(mobileNavigation).getByRole("link", { name: label })
      ).toBeInTheDocument();
    }
    expect(
      within(mobileNavigation)
        .getAllByRole("link")
        .slice(0, 5)
        .map((link) => link.textContent?.trim())
    ).toEqual(["Resumen", "Grupos", "Clases", "Inscripciones", "Asistencia"]);

    fireEvent.click(within(mobileNavigation).getByText("Más"));
    expect(
      within(mobileNavigation).getByRole("link", { name: "Gimnastas" })
    ).toHaveAttribute(
      "href",
      `/owner/athletes?organizationId=${organizationId}`
    );
    expect(
      within(mobileNavigation).getByRole("link", { name: "Cobros" })
    ).toHaveAttribute(
      "href",
      `/owner/payments?organizationId=${organizationId}&locationId=${locationId}`
    );
  });

  it("marks the current module and keeps its academy and location scope", () => {
    routeState.pathname = "/owner/classes";
    renderOwnerWorkspace();

    const desktopNavigation = screen.getByRole("navigation", {
      name: "Principal",
    });
    expect(
      within(desktopNavigation).getByRole("link", { name: "Clases" })
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(desktopNavigation).getByRole("link", { name: "Resumen" })
    ).not.toHaveAttribute("aria-current");
    expect(
      within(desktopNavigation).getByRole("link", { name: "Clases" })
    ).toHaveAttribute(
      "href",
      `/owner/classes?organizationId=${organizationId}&locationId=${locationId}`
    );
  });

  it("keeps initial academy setup focused by hiding workspace module navigation", () => {
    routeState.pathname = "/owner/setup";
    searchParams.delete("organizationId");
    searchParams.delete("locationId");
    render(<OwnerWorkspaceNavigation />);

    expect(
      screen.queryByRole("navigation", { name: "Principal" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Navegación móvil" })
    ).not.toBeInTheDocument();
  });
});
