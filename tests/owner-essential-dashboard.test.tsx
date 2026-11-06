// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerEssentialDashboard } from "@/components/owner-dashboard/OwnerEssentialDashboard";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

afterEach(cleanup);
const scope: OwnerScope = {
  organization: { id: "00000000-0000-4000-8000-000000000001", name: "Academia QA", defaultCurrency: "EUR" },
  member: { id: "qa-member", role: "manager", locationScopeMode: "assigned" },
  locations: [{ id: "00000000-0000-4000-8000-000000000002", name: "Sede autorizada" }],
  selectedLocationId: "00000000-0000-4000-8000-000000000002",
  canViewOrganizationAggregate: false,
};

describe("essential Owner launch surface", () => {
  it("keeps operations accessible when summary data is unavailable without inventing zero", () => {
    render(<OwnerEssentialDashboard scope={scope} operationalSummary={null} />);
    expect(screen.getByRole("heading", { name: "Resumen operativo no disponible" })).toBeTruthy();
    expect(screen.queryByText("Tu academia en marcha")).toBeNull();
    const navigation = screen.getByRole("navigation", { name: "Operaciones de la academia" });
    for (const label of ["Grupos", "Clases", "Inscripciones", "Asistencia"]) {
      expect(within(navigation).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(within(navigation).queryByRole("link", { name: "Cuotas mensuales" })).toBeNull();
    expect(within(navigation).queryByRole("link", { name: "Cobros manuales" })).toBeNull();
    expect(within(navigation).queryByRole("link", { name: "Gimnastas" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Insights|Health Score|Retención|Capacidad/i })).toBeNull();
  });
  it("muestra finanzas a Owner y Admin, pero reserva Gimnastas para scope de todas las sedes", () => {
    const navigationFor = (role: "owner" | "admin") => {
      const view = render(
        <OwnerEssentialDashboard
          scope={{
            ...scope,
            member: { ...scope.member, role },
          }}
          operationalSummary={null}
        />
      );
      const navigation = screen.getByRole("navigation", { name: "Operaciones de la academia" });
      expect(within(navigation).getByRole("link", { name: "Cuotas mensuales" })).toBeInTheDocument();
      expect(within(navigation).getByRole("link", { name: "Cobros manuales" })).toBeInTheDocument();
      return { navigation, unmount: view.unmount };
    };

    const ownerView = navigationFor("owner");
    expect(within(ownerView.navigation).queryByRole("link", { name: "Gimnastas" })).toBeNull();

    ownerView.unmount();
    const adminView = navigationFor("admin");
    expect(within(adminView.navigation).queryByRole("link", { name: "Gimnastas" })).toBeNull();
    adminView.unmount();
  });
  it("muestra Gimnastas a Owner o Admin con scope de todas las sedes", () => {
    for (const role of ["owner", "admin"] as const) {
      const { unmount } = render(
        <OwnerEssentialDashboard
          scope={{
            ...scope,
            member: { ...scope.member, role, locationScopeMode: "all" },
          }}
          operationalSummary={null}
        />
      );
      expect(screen.getByRole("link", { name: "Gimnastas" })).toHaveAttribute(
        "href",
        `/owner/athletes?organizationId=${scope.organization.id}`
      );
      unmount();
    }
  });
  it("offers only authorized locations and no aggregate option for a restricted manager", () => {
    render(<OwnerEssentialDashboard scope={scope} operationalSummary={null} />);
    const selector = screen.getByRole("combobox", { name: "Sede" });
    expect(within(selector).getAllByRole("option").map(option => option.textContent)).toEqual(["Sede autorizada"]);
    expect((selector as HTMLSelectElement).value).toBe(scope.selectedLocationId);
    expect(screen.getByRole("button", { name: "Ver resumen" }).closest("form")?.getAttribute("method")).toBe("get");
  });
  it("preserves academy and location in operational links and the GET form", () => {
    render(<OwnerEssentialDashboard scope={{ ...scope, organization: { ...scope.organization, name: "Club de gimnasia artística y rítmica con actividades complementarias" }, locations: [{ ...scope.locations[0], name: "Sede de entrenamiento y preparación de conjuntos de competición" }], member: { ...scope.member, role: "owner", locationScopeMode: "all" } }} operationalSummary={null} />);
    expect(screen.getByRole("heading", { level: 1, name: "Resumen" })).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Operaciones de la academia" });
    for (const label of ["Grupos", "Clases", "Inscripciones", "Asistencia", "Cuotas mensuales", "Cobros manuales"]) {
      const url = new URL(within(navigation).getByRole("link", { name: label }).getAttribute("href")!, "https://example.test");
      expect(url.searchParams.get("organizationId")).toBe(scope.organization.id);
      expect(url.searchParams.get("locationId")).toBe(scope.selectedLocationId);
    }
    const athleteUrl = new URL(within(navigation).getByRole("link", { name: "Gimnastas" }).getAttribute("href")!, "https://example.test");
    expect(athleteUrl.searchParams.get("organizationId")).toBe(scope.organization.id);
    expect(athleteUrl.searchParams.has("locationId")).toBe(false);
    const form = screen.getByRole("button", { name: "Ver resumen" }).closest("form")!;
    expect(form).toHaveAttribute("action", "/owner");
    expect(form).toHaveAttribute("method", "get");
    expect(form.querySelector('input[name="organizationId"]')).toHaveAttribute("value", scope.organization.id);
    expect(screen.getByRole("combobox", { name: "Sede" })).toHaveValue(scope.selectedLocationId);
  });
  it("offers the organization aggregate only when scope authorizes it", () => {
    render(<OwnerEssentialDashboard scope={{ ...scope, canViewOrganizationAggregate: true, selectedLocationId: null }} operationalSummary={null} />);
    expect(screen.getByRole("option", { name: "Todas las sedes autorizadas" }).getAttribute("value")).toBe("");
  });
});
