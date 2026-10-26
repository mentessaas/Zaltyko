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
    expect(within(navigation).getByRole("link", { name: "Cuotas mensuales" }).getAttribute("href")).toBe(`/owner/monthly-invoices?organizationId=${scope.organization.id}&locationId=${scope.selectedLocationId}`);
    expect(within(navigation).getByRole("link", { name: "Gimnastas" }).getAttribute("href")).toBe(`/owner/athletes?organizationId=${scope.organization.id}`);
    expect(screen.queryByRole("link", { name: /Insights|Health Score|Retención|Capacidad/i })).toBeNull();
  });
  it("offers only authorized locations and no aggregate option for a restricted manager", () => {
    render(<OwnerEssentialDashboard scope={scope} operationalSummary={null} />);
    const selector = screen.getByRole("combobox", { name: "Sede" });
    expect(within(selector).getAllByRole("option").map(option => option.textContent)).toEqual(["Sede autorizada"]);
    expect((selector as HTMLSelectElement).value).toBe(scope.selectedLocationId);
    expect(screen.getByRole("button", { name: "Ver resumen" }).closest("form")?.getAttribute("method")).toBe("get");
  });
  it("offers the organization aggregate only when scope authorizes it", () => {
    render(<OwnerEssentialDashboard scope={{ ...scope, canViewOrganizationAggregate: true, selectedLocationId: null }} operationalSummary={null} />);
    expect(screen.getByRole("option", { name: "Todas las sedes autorizadas" }).getAttribute("value")).toBe("");
  });
});
