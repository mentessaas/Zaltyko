// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { MouseEventHandler, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  pathname: "/owner/preview",
  search: "organizationId=synthetic-organization&locationId=synthetic-location",
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
  OwnerOperationalPolicy: () => null,
}));

import { OwnerWorkspaceNavigation } from "@/components/owner-dashboard/OwnerWorkspaceNavigation";
import { ownerWorkspaceCapabilitiesFor } from "@/components/owner-dashboard/owner-workspace-capabilities";

beforeEach(() => {
  navigationMocks.pathname = "/owner/preview";
  navigationMocks.search = "organizationId=synthetic-organization&locationId=synthetic-location";
});

afterEach(() => {
  cleanup();
});

describe("navegación móvil Owner", () => {
  it("ofrece salida de sesión también durante la creación de academia", () => {
    navigationMocks.pathname = "/owner/setup";
    navigationMocks.search = "";
    render(<OwnerWorkspaceNavigation />);
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeEnabled();
    expect(screen.queryByRole("navigation", { name: "Principal", hidden: true })).toBeNull();
  });

  it("no ofrece una salida de sesión en la vista sintética", () => {
    render(<OwnerWorkspaceNavigation previewMode />);
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).toBeNull();
  });
  it("cierra Más al activar el anchor de Cobros en preview aunque no cambie la ruta", () => {
    render(<OwnerWorkspaceNavigation previewMode />);
    const details = screen.getByText("Más").closest("details") as HTMLDetailsElement | null;
    expect(details).not.toBeNull();

    fireEvent.click(screen.getByText("Más"));
    expect(details?.open).toBe(true);
    const cobrosLink = within(details as HTMLDetailsElement).getByRole("link", { name: "Cobros", hidden: true });
    expect(cobrosLink).toHaveAttribute("href", "#metric-collection_rate");
    const summary = details?.querySelector("summary");
    cobrosLink.focus();
    expect(document.activeElement).toBe(cobrosLink);

    fireEvent.click(cobrosLink);

    expect(details?.open).toBe(false);
    expect(navigationMocks.pathname).toBe("/owner/preview");
    expect(document.activeElement).toBe(summary);
  });

  it("conserva la academia y sede y marca Grupos como actual en una ruta anidada", () => {
    const organizationId = "80000000-0000-4000-8000-000000000001";
    const locationId = "80000000-0000-4000-8000-000000000002";
    navigationMocks.pathname = "/owner/groups/80000000-0000-4000-8000-000000000003";
    navigationMocks.search = `organizationId=${organizationId}&locationId=${locationId}`;
    render(
      <OwnerWorkspaceNavigation
        capabilities={ownerWorkspaceCapabilitiesFor({
          role: "owner",
          locationScopeMode: "all",
        })}
        organizationId={organizationId}
        locationId={locationId}
      />
    );

    const desktopNavigation = within(screen.getByRole("navigation", { name: "Principal", hidden: true }));
    const mobileNavigation = within(screen.getByRole("navigation", { name: "Navegación móvil", hidden: true }));
    for (const navigation of [desktopNavigation, mobileNavigation]) {
      expect(navigation.getByRole("link", { name: "Grupos", hidden: true })).toHaveAttribute(
        "href",
        `/owner/groups?organizationId=${organizationId}&locationId=${locationId}`
      );
      expect(navigation.getByRole("link", { name: "Grupos", hidden: true })).toHaveAttribute("aria-current", "page");
      expect(navigation.getByRole("link", { name: "Clases", hidden: true })).toHaveAttribute(
        "href",
        `/owner/classes?organizationId=${organizationId}&locationId=${locationId}`
      );
    }
  });

  it("abre Gimnastas con el contexto de academia y sin arrastrar una sede", () => {
    const organizationId = "80000000-0000-4000-8000-000000000001";
    const locationId = "80000000-0000-4000-8000-000000000002";
    navigationMocks.pathname = "/owner/athletes";
    navigationMocks.search = `organizationId=${organizationId}&locationId=${locationId}`;
    render(
      <OwnerWorkspaceNavigation
        capabilities={ownerWorkspaceCapabilitiesFor({
          role: "owner",
          locationScopeMode: "all",
        })}
        organizationId={organizationId}
        locationId={locationId}
      />
    );

    const desktopNavigation = within(screen.getByRole("navigation", { name: "Principal", hidden: true }));
    const mobileNavigation = within(screen.getByRole("navigation", { name: "Navegación móvil", hidden: true }));
    for (const navigation of [desktopNavigation, mobileNavigation]) {
      const athletesLink = navigation.getByRole("link", { name: "Gimnastas", hidden: true });
      expect(athletesLink).toHaveAttribute("href", `/owner/athletes?organizationId=${organizationId}`);
      expect(athletesLink).toHaveAttribute("aria-current", "page");
      expect(athletesLink.getAttribute("href")).not.toContain(locationId);
    }
  });

  it("oculta Gimnastas, Cuotas, Cobros y Plan a manager en desktop y móvil", () => {
    const organizationId = "80000000-0000-4000-8000-000000000011";
    const locationId = "80000000-0000-4000-8000-000000000012";
    navigationMocks.pathname = "/owner/groups";
    navigationMocks.search = `organizationId=${organizationId}&locationId=${locationId}`;
    render(
      <OwnerWorkspaceNavigation
        capabilities={ownerWorkspaceCapabilitiesFor({
          role: "manager",
          locationScopeMode: "selected",
        })}
        organizationId={organizationId}
        locationId={locationId}
      />
    );

    const desktopNavigation = within(
      screen.getByRole("navigation", { name: "Principal", hidden: true })
    );
    const mobileNavigation = within(
      screen.getByRole("navigation", { name: "Navegación móvil", hidden: true })
    );
    for (const navigation of [desktopNavigation, mobileNavigation]) {
      for (const restrictedLabel of ["Gimnastas", "Cuotas", "Cobros", "Plan"]) {
        expect(
          navigation.queryByRole("link", { name: restrictedLabel, hidden: true })
        ).toBeNull();
      }
      for (const operationalLabel of ["Resumen", "Grupos", "Clases", "Inscripciones", "Asistencia"]) {
        expect(
          navigation.getByRole("link", { name: operationalLabel, hidden: true })
        ).toBeInTheDocument();
      }
    }
    expect(mobileNavigation.queryByText("Más", { selector: "summary" })).toBeNull();
    expect(
      desktopNavigation.getByRole("link", { name: "Grupos", hidden: true })
    ).toHaveAttribute(
      "href",
      `/owner/groups?organizationId=${organizationId}&locationId=${locationId}`
    );
  });

  it("muestra rutas según capacidades owner/admin y falla cerrado si solo hay query", () => {
    const organizationId = "80000000-0000-4000-8000-000000000021";
    const locationId = "80000000-0000-4000-8000-000000000022";
    navigationMocks.pathname = "/owner/groups";
    navigationMocks.search = `organizationId=${organizationId}&locationId=${locationId}`;

    const { rerender } = render(
      <OwnerWorkspaceNavigation
        capabilities={ownerWorkspaceCapabilitiesFor({
          role: "owner",
          locationScopeMode: "all",
        })}
        organizationId={organizationId}
        locationId={locationId}
      />
    );
    const desktopNavigation = within(
      screen.getByRole("navigation", { name: "Principal", hidden: true })
    );
    const mobileNavigation = within(
      screen.getByRole("navigation", { name: "Navegación móvil", hidden: true })
    );
    for (const navigation of [desktopNavigation, mobileNavigation]) {
      for (const label of ["Gimnastas", "Cobros", "Plan"]) {
        expect(navigation.getByRole("link", { name: label, hidden: true })).toBeInTheDocument();
      }
    }

    rerender(
      <OwnerWorkspaceNavigation
        capabilities={ownerWorkspaceCapabilitiesFor({
          role: "admin",
          locationScopeMode: "all",
        })}
        organizationId={organizationId}
        locationId={locationId}
      />
    );
    expect(
      screen.getByRole("navigation", { name: "Principal", hidden: true }).querySelector('a[href^="/owner/subscription"]')
    ).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Principal", hidden: true })
    ).toHaveTextContent("Gimnastas");
    expect(
      screen.getByRole("navigation", { name: "Principal", hidden: true })
    ).toHaveTextContent("Cobros");

    rerender(
      <OwnerWorkspaceNavigation
        capabilities={ownerWorkspaceCapabilitiesFor({
          role: "admin",
          locationScopeMode: "selected",
        })}
        organizationId={organizationId}
        locationId={locationId}
      />
    );
    const scopedAdminDesktop = screen.getByRole("navigation", {
      name: "Principal",
      hidden: true,
    });
    const scopedAdminMobile = screen.getByRole("navigation", {
      name: "Navegación móvil",
      hidden: true,
    });
    for (const navigation of [scopedAdminDesktop, scopedAdminMobile]) {
      expect(navigation).not.toHaveTextContent("Gimnastas");
      expect(navigation).toHaveTextContent("Cobros");
      expect(navigation).not.toHaveTextContent("Plan");
    }

    rerender(<OwnerWorkspaceNavigation organizationId={organizationId} locationId={locationId} />);
    const failClosedDesktop = screen.getByRole("navigation", {
      name: "Principal",
      hidden: true,
    });
    const failClosedMobile = screen.getByRole("navigation", {
      name: "Navegación móvil",
      hidden: true,
    });
    expect(failClosedDesktop).not.toHaveTextContent("Gimnastas");
    expect(failClosedDesktop).not.toHaveTextContent("Cobros");
    expect(failClosedDesktop).not.toHaveTextContent("Plan");
    expect(failClosedMobile).not.toHaveTextContent("Gimnastas");
    expect(failClosedMobile).not.toHaveTextContent("Cobros");
    expect(failClosedMobile).not.toHaveTextContent("Plan");

    // A raw URL cannot supply either capabilities or an authorized tenant context.
    rerender(<OwnerWorkspaceNavigation />);
    for (const name of ["Principal", "Navegación móvil"]) {
      const navigation = within(screen.getByRole("navigation", { name, hidden: true }));
      expect(navigation.getByRole("link", { name: "Grupos", hidden: true }))
        .toHaveAttribute("href", "/owner/groups");
    }
  });
});
