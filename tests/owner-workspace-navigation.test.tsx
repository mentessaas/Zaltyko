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
    render(<OwnerWorkspaceNavigation />);
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).toBeNull();
  });
  it("cierra Más al activar el anchor de Cobros en preview aunque no cambie la ruta", () => {
    render(<OwnerWorkspaceNavigation />);
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
    render(<OwnerWorkspaceNavigation />);

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
    render(<OwnerWorkspaceNavigation />);

    const desktopNavigation = within(screen.getByRole("navigation", { name: "Principal", hidden: true }));
    const mobileNavigation = within(screen.getByRole("navigation", { name: "Navegación móvil", hidden: true }));
    for (const navigation of [desktopNavigation, mobileNavigation]) {
      const athletesLink = navigation.getByRole("link", { name: "Gimnastas", hidden: true });
      expect(athletesLink).toHaveAttribute("href", `/owner/athletes?organizationId=${organizationId}`);
      expect(athletesLink).toHaveAttribute("aria-current", "page");
      expect(athletesLink.getAttribute("href")).not.toContain(locationId);
    }
  });
});
