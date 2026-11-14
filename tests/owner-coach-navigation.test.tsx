// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { MouseEventHandler, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  pathname: "/owner/attendance",
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => navigationMocks.pathname,
  useSearchParams: () => new URLSearchParams(navigationMocks.search),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, onClick, "aria-current": ariaCurrent }: { href: string; children: ReactNode; onClick?: MouseEventHandler<HTMLAnchorElement>; "aria-current"?: "page" }) => (
    <a href={href} onClick={onClick} aria-current={ariaCurrent}>{children}</a>
  ),
}));

vi.mock("@/components/owner-dashboard/OwnerOperationalPolicy", () => ({
  OwnerOperationalPolicy: () => <p>operational-policy-probe</p>,
}));
vi.mock("@/components/owner-dashboard/OwnerSidebarPlanCard", () => ({
  OwnerSidebarPlanCard: () => <p>sidebar-plan-card</p>,
}));

import { OwnerWorkspaceNavigation } from "@/components/owner-dashboard/OwnerWorkspaceNavigation";
import { ownerWorkspaceCapabilitiesFor } from "@/components/owner-dashboard/owner-workspace-capabilities";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const locationId = "a0000000-0000-4000-8000-000000000011";
const ALL_LABELS = [
  "Resumen",
  "Calendario",
  "Grupos",
  "Gimnastas",
  "Equipo",
  "Clases",
  "Inscripciones",
  "Solicitudes",
  "Asistencia",
  "Cobros",
  "Plan",
];

beforeEach(() => {
  navigationMocks.pathname = "/owner/attendance";
  navigationMocks.search = "";
});

afterEach(() => {
  cleanup();
});

function renderFor(role: string, locationScopeMode = "selected") {
  return render(
    <OwnerWorkspaceNavigation
      capabilities={ownerWorkspaceCapabilitiesFor({ role, locationScopeMode })}
      organizationId={organizationId}
      locationId={locationId}
    />
  );
}

function linkLabels(name: string): string[] {
  return within(screen.getByRole("navigation", { name, hidden: true }))
    .queryAllByRole("link", { hidden: true })
    .map((link) => link.textContent?.trim() ?? "");
}

describe("capacidad coachOperationsOnly", () => {
  it("solo se activa para el rol coach", () => {
    for (const role of ["owner", "admin", "manager"]) {
      for (const mode of ["all", "selected"]) {
        expect(
          ownerWorkspaceCapabilitiesFor({ role, locationScopeMode: mode }).coachOperationsOnly
        ).toBe(false);
      }
    }
    const coach = ownerWorkspaceCapabilitiesFor({ role: "coach", locationScopeMode: "all" });
    expect(coach).toEqual({
      canManageOrganizationAthletes: false,
      canManageFinancials: false,
      canManageSubscription: false,
      canManageStaffProfiles: false,
      canManageTeamAccess: false,
      coachOperationsOnly: true,
    });
  });
});

describe("navegación del coach", () => {
  it("mantiene los landmarks y ofrece solo Calendario y Asistencia con su sede", () => {
    renderFor("coach");

    for (const name of ["Principal", "Navegación móvil"]) {
      expect(linkLabels(name)).toEqual(["Calendario", "Asistencia"]);
      expect(
        within(screen.getByRole("navigation", { name, hidden: true })).getByRole("link", {
          name: "Calendario",
          hidden: true,
        })
      ).toHaveAttribute(
        "href",
        `/owner/calendar?organizationId=${organizationId}&locationId=${locationId}`
      );
      expect(
        within(screen.getByRole("navigation", { name, hidden: true })).getByRole("link", {
          name: "Asistencia",
          hidden: true,
        })
      ).toHaveAttribute(
        "href",
        `/owner/attendance?organizationId=${organizationId}&locationId=${locationId}`
      );
    }
    expect(screen.queryByText("Más")).toBeNull();
  });

  it("no muestra la tarjeta de plan aunque conserve la comprobación de solo lectura", () => {
    renderFor("coach", "all");

    expect(screen.queryByText("sidebar-plan-card")).toBeNull();
    expect(screen.getByText("operational-policy-probe")).toBeInTheDocument();
  });

  it.each(["Resumen", "Grupos", "Gimnastas", "Equipo", "Clases", "Inscripciones", "Solicitudes", "Cobros", "Plan"])(
    "no enlaza %s ni en escritorio ni en móvil",
    (label) => {
      renderFor("coach", "all");
      for (const name of ["Principal", "Navegación móvil"]) {
        expect(linkLabels(name)).not.toContain(label);
      }
    }
  );
});

describe("owner/admin/manager sin cambios", () => {
  it("el owner con todas las sedes sigue viendo los 11 destinos y la tarjeta de plan", () => {
    renderFor("owner", "all");

    expect([...linkLabels("Principal")].sort()).toEqual([...ALL_LABELS].sort());
    expect(screen.getByText("sidebar-plan-card")).toBeInTheDocument();
    expect(linkLabels("Navegación móvil").slice(0, 4)).toEqual([
      "Resumen",
      "Calendario",
      "Asistencia",
      "Clases",
    ]);
  });

  it("admin y manager conservan Resumen, Clases y Grupos", () => {
    for (const role of ["admin", "manager"]) {
      const { unmount } = renderFor(role, "selected");
      for (const label of ["Resumen", "Calendario", "Asistencia", "Clases", "Grupos", "Inscripciones"]) {
        expect(linkLabels("Principal")).toContain(label);
      }
      unmount();
    }
  });
});
