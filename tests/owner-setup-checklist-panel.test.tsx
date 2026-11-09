// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OwnerEssentialDashboard } from "@/components/owner-dashboard/OwnerEssentialDashboard";
import { OwnerSetupChecklistPanel } from "@/components/owner-dashboard/OwnerSetupChecklistPanel";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  buildOwnerSetupChecklist,
  type OwnerSetupProgress,
} from "@/modules/owner-dashboard/application/setup-checklist-steps";

afterEach(cleanup);

const organizationId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000002";
const empty: OwnerSetupProgress = {
  activeLocations: 0,
  hasScheduledClass: false,
  hasAthletes: false,
  hasEnrolledAthletes: false,
  hasAttendance: false,
};
const partial: OwnerSetupProgress = { ...empty, activeLocations: 1, hasScheduledClass: true };
const full: OwnerSetupProgress = {
  activeLocations: 1,
  hasScheduledClass: true,
  hasAthletes: true,
  hasEnrolledAthletes: true,
  hasAttendance: true,
};
const ownerScope: OwnerScope = {
  organization: { id: organizationId, name: "Academia QA", defaultCurrency: "EUR" },
  member: { id: "qa-member", role: "owner", locationScopeMode: "all" },
  locations: [{ id: locationId, name: "Sede Centro" }],
  selectedLocationId: null,
  canViewOrganizationAggregate: true,
};

function renderPanel(progress: OwnerSetupProgress, locationName?: string) {
  render(
    <OwnerSetupChecklistPanel
      checklist={buildOwnerSetupChecklist(progress, {
        organizationId,
        selectedLocationId: null,
        canManageOrganizationAthletes: true,
      })}
      locationName={locationName}
    />
  );
  return screen.queryByRole("region", { name: "Puesta en marcha" });
}

describe("OwnerSetupChecklistPanel", () => {
  it("lists the four steps in order inside a labelled region", () => {
    const region = renderPanel(empty);
    expect(region).not.toBeNull();
    const items = within(region!).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p > span")?.textContent)).toEqual([
      "Crea una sede",
      "Crea una clase con horario",
      "Da de alta a tus gimnastas",
      "Pasa la primera lista",
    ]);
    expect(within(region!).getByText("0 de 4 hechos")).toBeInTheDocument();
    expect(items[0]).toHaveAttribute("aria-current", "step");
  });

  it("marks done steps without links and links each pending step to its screen", () => {
    const region = renderPanel(partial)!;
    const items = within(region).getAllByRole("listitem");
    expect(within(region).getByText("2 de 4 hechos")).toBeInTheDocument();
    for (const done of items.slice(0, 2)) {
      expect(within(done).getByText("Hecho")).toBeInTheDocument();
      expect(within(done).queryByRole("link")).toBeNull();
    }
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(within(items[2]).getByText("Siguiente paso")).toBeInTheDocument();
    expect(within(items[2]).getByRole("link", { name: "Dar de alta" })).toHaveAttribute(
      "href",
      `/owner/athletes?organizationId=${organizationId}`
    );
    expect(items[3]).not.toHaveAttribute("aria-current");
    expect(within(items[3]).getByRole("link", { name: "Pasar lista" })).toHaveAttribute(
      "href",
      `/owner/attendance?organizationId=${organizationId}`
    );
  });

  it("names the selected site in the lead", () => {
    const region = renderPanel(partial, "Sede Centro")!;
    expect(within(region).getByText(/primera lista en Sede Centro/)).toBeInTheDocument();
  });

  it("disappears once the four steps are done", () => {
    expect(renderPanel(full)).toBeNull();
  });
});

describe("Resumen integration", () => {
  it("shows the checklist for an academy that is not operational yet", () => {
    render(<OwnerEssentialDashboard scope={ownerScope} operationalSummary={null} setupProgress={partial} />);
    expect(screen.getByRole("region", { name: "Puesta en marcha" })).toBeInTheDocument();
  });

  it("omits the checklist when its query failed or was not run, without hiding the rest", () => {
    for (const setupProgress of [null, undefined]) {
      const view = render(
        <OwnerEssentialDashboard scope={ownerScope} operationalSummary={null} setupProgress={setupProgress} />
      );
      expect(screen.queryByRole("region", { name: "Puesta en marcha" })).toBeNull();
      expect(screen.getByRole("navigation", { name: "Operaciones de la academia" })).toBeInTheDocument();
      view.unmount();
    }
  });

  it("hides the checklist once complete", () => {
    render(<OwnerEssentialDashboard scope={ownerScope} operationalSummary={null} setupProgress={full} />);
    expect(screen.queryByRole("region", { name: "Puesta en marcha" })).toBeNull();
  });

  it("does not add links to the quick-access navigation or extra forms", () => {
    const { container } = render(
      <OwnerEssentialDashboard scope={ownerScope} operationalSummary={null} setupProgress={empty} />
    );
    const navigation = screen.getByRole("navigation", { name: "Operaciones de la academia" });
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Gimnastas",
      "Grupos",
      "Clases",
      "Inscripciones",
      "Asistencia",
      "Cuotas mensuales",
      "Cobros manuales",
    ]);
    const region = screen.getByRole("region", { name: "Puesta en marcha" });
    expect(navigation.contains(region)).toBe(false);
    expect(container.querySelectorAll('form[action="/owner"]')).toHaveLength(1);
  });

  it("keeps the selected site in the checklist links", () => {
    render(
      <OwnerEssentialDashboard
        scope={{ ...ownerScope, selectedLocationId: locationId }}
        operationalSummary={null}
        setupProgress={partial}
      />
    );
    const region = screen.getByRole("region", { name: "Puesta en marcha" });
    expect(within(region).getByRole("link", { name: "Pasar lista" })).toHaveAttribute(
      "href",
      `/owner/attendance?organizationId=${organizationId}&locationId=${locationId}`
    );
    expect(within(region).getByText(/primera lista en Sede Centro/)).toBeInTheDocument();
  });
});
