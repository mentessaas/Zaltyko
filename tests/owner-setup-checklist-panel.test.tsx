// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  // Formato Magnesio de /app: número gigante del paso actual, «Paso N de M ·
  // X% completado», barra de progreso, acción del paso y pendientes plegados.
  it("muestra el paso actual en grande con su porcentaje y su barra", () => {
    const region = renderPanel(empty)!;
    expect(region).not.toBeNull();
    expect(within(region).getByText("Paso 1 de 4 · 0% completado")).toBeInTheDocument();
    const meter = within(region).getByRole("progressbar", { name: "Progreso de la puesta en marcha" });
    expect(meter).toHaveAttribute("aria-valuenow", "0");
    expect(meter).toHaveAttribute("aria-valuetext", "0 de 4 pasos hechos");
    expect(region.querySelector('[aria-current="step"]')).toHaveTextContent("Crea una sede");
    // La sede no tiene pantalla propia: sin acción inventada.
    expect(within(region).queryByRole("link")).toBeNull();
  });

  it("despliega los pendientes en orden y marca el actual", () => {
    const region = renderPanel(empty)!;
    expect(within(region).queryByRole("list", { name: "Pasos pendientes" })).toBeNull();
    const toggle = within(region).getByRole("button", { name: "Ver 4 pendientes" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("Ocultar pasos");
    const list = within(region).getByRole("list", { name: "Pasos pendientes" });
    expect(toggle).toHaveAttribute("aria-controls", list.id);
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p > span")?.textContent)).toEqual([
      "Crea una sede",
      "Crea una clase con horario",
      "Da de alta a tus gimnastas",
      "Pasa la primera lista",
    ]);
    expect(items[0]).toHaveAttribute("aria-current", "step");
    expect(within(items[0]).getByText("Siguiente paso")).toBeInTheDocument();
  });

  it("enlaza el paso actual como acción principal y deja fuera los hechos", () => {
    const region = renderPanel(partial)!;
    expect(within(region).getByText("Paso 3 de 4 · 50% completado")).toBeInTheDocument();
    expect(within(region).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(within(region).getAllByRole("link")).toHaveLength(1);
    expect(within(region).getByRole("link", { name: "Dar de alta" })).toHaveAttribute(
      "href",
      `/owner/athletes?organizationId=${organizationId}`
    );

    fireEvent.click(within(region).getByRole("button", { name: "Ver 2 pendientes" }));
    const items = within(within(region).getByRole("list", { name: "Pasos pendientes" })).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p > span")?.textContent)).toEqual([
      "Da de alta a tus gimnastas",
      "Pasa la primera lista",
    ]);
    expect(items[0]).toHaveAttribute("aria-current", "step");
    // La acción del actual ya está arriba; no se duplica en la fila.
    expect(within(items[0]).queryByRole("link")).toBeNull();
    expect(items[1]).not.toHaveAttribute("aria-current");
    expect(within(items[1]).getByRole("link", { name: "Pasar lista" })).toHaveAttribute(
      "href",
      `/owner/attendance?organizationId=${organizationId}`
    );
  });

  it("no ofrece desplegar cuando solo queda el paso actual", () => {
    const region = renderPanel({ ...full, hasAttendance: false })!;
    expect(within(region).getByText("Paso 4 de 4 · 75% completado")).toBeInTheDocument();
    expect(within(region).queryByRole("button")).toBeNull();
    expect(within(region).getByRole("link", { name: "Pasar lista" })).toBeInTheDocument();
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
    fireEvent.click(within(region).getByRole("button", { name: "Ver 2 pendientes" }));
    expect(within(region).getByRole("link", { name: "Pasar lista" })).toHaveAttribute(
      "href",
      `/owner/attendance?organizationId=${organizationId}&locationId=${locationId}`
    );
    expect(within(region).getByText(/primera lista en Sede Centro/)).toBeInTheDocument();
  });
});
