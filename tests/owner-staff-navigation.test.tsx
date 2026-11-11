// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { MouseEventHandler, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  pathname: "/owner/staff",
  search: "organizationId=80000000-0000-4000-8000-000000000001&locationId=80000000-0000-4000-8000-000000000002",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
  useSearchParams: () => new URLSearchParams(navigationMocks.search),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, onClick, "aria-current": ariaCurrent }: { href: string; children: ReactNode; onClick?: MouseEventHandler<HTMLAnchorElement>; "aria-current"?: "page" }) => (
    <a href={href} onClick={onClick} aria-current={ariaCurrent}>{children}</a>
  ),
}));

vi.mock("@/components/owner-dashboard/OwnerOperationalPolicy", () => ({ OwnerOperationalPolicy: () => null }));
vi.mock("@/components/owner-dashboard/OwnerSignOutButton", () => ({ OwnerSignOutButton: () => null }));

import { OwnerWorkspaceNavigation } from "@/components/owner-dashboard/OwnerWorkspaceNavigation";
import { ownerWorkspaceCapabilitiesFor } from "@/components/owner-dashboard/owner-workspace-capabilities";

const ORGANIZATION_ID = "80000000-0000-4000-8000-000000000001";
const LOCATION_ID = "80000000-0000-4000-8000-000000000002";

beforeEach(() => {
  navigationMocks.pathname = "/owner/staff";
  navigationMocks.search = `organizationId=${ORGANIZATION_ID}&locationId=${LOCATION_ID}`;
});

afterEach(() => cleanup());

describe("navegación de Equipo", () => {
  it("muestra Equipo en Más en escritorio y móvil, conservando solo la academia", () => {
    render(
      <OwnerWorkspaceNavigation
        capabilities={ownerWorkspaceCapabilitiesFor({ role: "owner", locationScopeMode: "all" })}
        organizationId={ORGANIZATION_ID}
        locationId={LOCATION_ID}
      />,
    );

    const desktop = within(screen.getByRole("navigation", { name: "Principal", hidden: true }));
    const mobile = within(screen.getByRole("navigation", { name: "Navegación móvil", hidden: true }));
    for (const navigation of [desktop, mobile]) {
      const personal = navigation.getByRole("link", { name: "Equipo", hidden: true });
      expect(personal).toHaveAttribute("href", `/owner/staff?organizationId=${ORGANIZATION_ID}`);
      expect(personal).toHaveAttribute("aria-current", "page");
      expect(personal.getAttribute("href")).not.toContain(LOCATION_ID);
    }

    const desktopNav = screen.getByRole("navigation", { name: "Principal", hidden: true });
    const firstLevelLinks = [...desktopNav.children].filter((child) => child.tagName === "A");
    expect(firstLevelLinks).toHaveLength(8);
    expect(firstLevelLinks.map((link) => link.textContent)).not.toContain("Equipo");
    expect(within(desktopNav).getByText("Más")).toBeInTheDocument();
  });

  it.each([
    { role: "owner", locationScopeMode: "selected" },
    { role: "admin", locationScopeMode: "all" },
    { role: "manager", locationScopeMode: "all" },
    { role: "coach", locationScopeMode: "all" },
  ])("no muestra Equipo a $role con alcance $locationScopeMode", ({ role, locationScopeMode }) => {
    render(
      <OwnerWorkspaceNavigation
        capabilities={ownerWorkspaceCapabilitiesFor({ role, locationScopeMode })}
        organizationId={ORGANIZATION_ID}
      />,
    );
    expect(screen.queryByRole("link", { name: "Equipo", hidden: true })).toBeNull();
  });

  it.each([
    { role: "admin", locationScopeMode: "all", visible: true },
    { role: "manager", locationScopeMode: "selected", visible: true },
    { role: "admin", locationScopeMode: "selected", visible: false },
    { role: "coach", locationScopeMode: "all", visible: false },
  ])("con invitaciones de equipo activas (O3), Equipo es visible para $role/$locationScopeMode: $visible", ({ role, locationScopeMode, visible }) => {
    render(
      <OwnerWorkspaceNavigation
        capabilities={ownerWorkspaceCapabilitiesFor({ role, locationScopeMode }, { teamAccessEnabled: true })}
        organizationId={ORGANIZATION_ID}
      />,
    );
    const links = screen.queryAllByRole("link", { name: "Equipo", hidden: true });
    if (visible) {
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) expect(link).toHaveAttribute("href", `/owner/staff?organizationId=${ORGANIZATION_ID}`);
    } else {
      expect(links).toHaveLength(0);
    }
  });

  it("no muestra Equipo en la navegación sintética", () => {
    render(<OwnerWorkspaceNavigation previewMode />);
    expect(screen.queryByRole("link", { name: "Equipo", hidden: true })).toBeNull();
  });
});
