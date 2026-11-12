// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({ pathname: "/owner", search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => navigationMocks.pathname,
  useSearchParams: () => new URLSearchParams(navigationMocks.search),
}));
vi.mock("@/components/owner-dashboard/OwnerOperationalPolicy", () => ({
  OwnerOperationalPolicy: () => null,
}));
// Sin el flag de equipo el shell no consulta la disponibilidad; se aísla igual.
vi.mock("@/modules/staff/application/canonical-team-access", () => ({
  isCanonicalTeamAccessAvailableCached: async () => false,
}));

import { OwnerWorkspaceNavigation } from "@/components/owner-dashboard/OwnerWorkspaceNavigation";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";
import { ownerWorkspaceCapabilitiesFor } from "@/components/owner-dashboard/owner-workspace-capabilities";

const organizationId = "c0000000-0000-4000-8000-000000000001";
const locationId = "c0000000-0000-4000-8000-000000000002";
const academyName = "Club Gimnasia Magnesio";

beforeEach(() => {
  navigationMocks.pathname = "/owner";
  navigationMocks.search = `organizationId=${organizationId}&locationId=${locationId}`;
});
afterEach(cleanup);

function renderFor(role: string, locationScopeMode: string, organizationName: string | null = academyName) {
  return render(
    <OwnerWorkspaceNavigation
      capabilities={ownerWorkspaceCapabilitiesFor({ role, locationScopeMode })}
      organizationId={organizationId}
      locationId={locationId}
      organizationName={organizationName}
    />
  );
}

function sidebar() {
  const aside = document.querySelector("aside[data-owner-sidebar]");
  expect(aside).not.toBeNull();
  return aside as HTMLElement;
}

function principalLabels() {
  return within(screen.getByRole("navigation", { name: "Principal", hidden: true }))
    .queryAllByRole("link", { hidden: true })
    .map((link) => link.textContent?.trim());
}

describe("lateral Magnesio de /owner", () => {
  it("es tapiz azul profundo con la academia rotulada, su plan y la acción principal", () => {
    act(() => {
      publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
    });
    renderFor("owner", "all");
    const aside = sidebar();
    expect(aside).toHaveClass("mat-field-deep", "text-white");

    const academyLink = within(aside).getByRole("link", { name: academyName, hidden: true });
    expect(academyLink).toHaveAttribute("href", `/owner?organizationId=${organizationId}&locationId=${locationId}`);
    expect(academyLink.closest("div")).toHaveClass("border-b-[3px]", "border-white");
    expect(within(aside).getByText("Plan Free")).toHaveClass("floor-label", "text-mat-lane");

    const addAthlete = within(aside).getByRole("link", { name: "Añadir gimnasta", hidden: true });
    expect(addAthlete).toHaveAttribute("href", `/owner/athletes?organizationId=${organizationId}#new-athlete-heading`);
    expect(addAthlete).toHaveClass("bg-white", "text-mat-deep", "touch-target");
    // La acción vive fuera de la navegación: los 10 destinos no cambian.
    expect(screen.getByRole("navigation", { name: "Principal", hidden: true }).contains(addAthlete)).toBe(false);

    for (const title of ["Día a día", "Personas", "Club"]) {
      expect(within(aside).getByText(title)).toHaveClass("floor-label", "text-mat-lane");
    }
  });

  it("marca el destino activo como cinta blanca y mantiene objetivos de 44 px con foco blanco", () => {
    renderFor("owner", "all");
    const navigation = screen.getByRole("navigation", { name: "Principal", hidden: true });
    const active = within(navigation).getByRole("link", { name: "Resumen", hidden: true });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveClass("bg-white", "text-mat-deep");
    const rest = within(navigation).getByRole("link", { name: "Grupos", hidden: true });
    expect(rest).not.toHaveAttribute("aria-current");
    expect(rest).toHaveClass("text-white/80");
    for (const link of within(navigation).getAllByRole("link", { hidden: true })) {
      expect(link).toHaveClass("touch-target", "focus-visible:outline-white");
    }
  });

  it("dirección (owner con todas las sedes) ve los 10 destinos", () => {
    renderFor("owner", "all");
    expect([...principalLabels()].sort()).toEqual(
      ["Resumen", "Grupos", "Gimnastas", "Equipo", "Clases", "Inscripciones", "Solicitudes", "Asistencia", "Cobros", "Plan"].sort()
    );
  });

  it("admin con sedes limitadas: sin Gimnastas, Plan ni «Añadir gimnasta»", () => {
    renderFor("admin", "selected");
    const labels = principalLabels();
    expect(labels).toEqual(expect.arrayContaining(["Resumen", "Grupos", "Clases", "Inscripciones", "Asistencia", "Cobros"]));
    for (const hidden of ["Gimnastas", "Plan", "Equipo"]) expect(labels).not.toContain(hidden);
    expect(within(sidebar()).queryByRole("link", { name: "Añadir gimnasta", hidden: true })).toBeNull();
  });

  it("manager: operación sin finanzas ni plan", () => {
    renderFor("manager", "selected");
    const labels = principalLabels();
    for (const hidden of ["Gimnastas", "Cobros", "Plan"]) expect(labels).not.toContain(hidden);
    expect(within(sidebar()).queryByRole("link", { name: "Añadir gimnasta", hidden: true })).toBeNull();
  });

  it("una entrenadora solo ve Asistencia, con la academia rotulada y sin plan ni acción", () => {
    act(() => {
      publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
    });
    renderFor("coach", "selected");
    const aside = sidebar();
    expect(principalLabels()).toEqual(["Asistencia"]);
    expect(within(screen.getByRole("navigation", { name: "Navegación móvil", hidden: true })).getAllByRole("link", { hidden: true })
      .map((link) => link.textContent?.trim())).toEqual(["Asistencia"]);
    expect(within(aside).getByRole("link", { name: academyName, hidden: true })).toBeInTheDocument();
    expect(within(aside).queryByText(/Plan /)).toBeNull();
    expect(within(aside).queryByRole("link", { name: "Añadir gimnasta", hidden: true })).toBeNull();
  });

  it("sin nombre de academia rotula la marca, sin inventar un nombre", () => {
    renderFor("owner", "all", null);
    expect(within(sidebar()).getByText("Zaltyko")).toBeInTheDocument();
  });

  it("la cabecera repite la academia solo donde no está el lateral y el móvil marca el activo en tapiz", () => {
    renderFor("owner", "all");
    const header = screen.getByRole("banner");
    expect(within(header).getByText(academyName).closest("span.flex")).toHaveClass("xl:hidden");
    const mobile = screen.getByRole("navigation", { name: "Navegación móvil", hidden: true });
    const active = within(mobile).getByRole("link", { name: "Resumen", hidden: true });
    expect(active).toHaveClass("bg-mat", "text-white", "touch-target", "text-xs");
  });
});

describe("OwnerWorkspacePageShell", () => {
  it("lleva el nombre autorizado de la academia al lateral", () => {
    render(
      <OwnerWorkspacePageShell
        member={{ role: "owner", locationScopeMode: "all" }}
        organizationId={organizationId}
        organizationName={academyName}
        locationId={locationId}
      >
        <main>contenido</main>
      </OwnerWorkspacePageShell>
    );
    expect(within(sidebar()).getByRole("link", { name: academyName, hidden: true })).toBeInTheDocument();
    expect(document.getElementById("owner-workspace-content")).toHaveTextContent("contenido");
  });
});
