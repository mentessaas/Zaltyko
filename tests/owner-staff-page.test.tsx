import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const pageMocks = vi.hoisted(() => ({
  userId: "80000000-0000-4000-8000-000000000010" as string | null,
  role: "owner",
  locationScopeMode: "all",
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({})) }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: pageMocks.userId ? { id: pageMocks.userId } : null } }) },
  })),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(async () => ({
    member: { role: pageMocks.role, locationScopeMode: pageMocks.locationScopeMode },
    organization: { id: "80000000-0000-4000-8000-000000000001", name: "Club de prueba" },
  })),
}));

import OwnerStaffPage from "@/app/owner/staff/page";
import { OwnerStaffManager } from "@/components/owner-dashboard/OwnerStaffManager";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { OwnerTeamAccessPanel } from "@/components/owner/OwnerTeamAccessPanel";

const ORGANIZATION_ID = "80000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", "false");
  pageMocks.userId = "80000000-0000-4000-8000-000000000010";
  pageMocks.role = "owner";
  pageMocks.locationScopeMode = "all";
});

afterEach(() => vi.unstubAllEnvs());

describe("entrada de Personal", () => {
  it("renderiza la academia autorizada sin seleccionar ni arrastrar una sede", async () => {
    const page = await OwnerStaffPage({
      searchParams: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    });
    const shell = page as ReactElement<{
      organizationId?: string;
      locationId?: string | null;
      children: ReactElement<{ organizationId: string; organizationName: string }>;
    }>;

    expect(shell.type).toBe(OwnerWorkspacePageShell);
    expect(shell.props.organizationId).toBe(ORGANIZATION_ID);
    expect(shell.props.locationId).toBeUndefined();
    expect(shell.props.children.props.organizationId).toBe(ORGANIZATION_ID);
    expect(shell.props.children.props.organizationName).toBe("Club de prueba");
    expect(shell.props.children.type).toBe(OwnerStaffManager);
    expect(shell.props.children.key).toBe(`staff:${ORGANIZATION_ID}`);
  });

  it("distingue las claves de los paneles hermanos de Personal y acceso", async () => {
    vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", "true");
    const shell = await OwnerStaffPage({
      searchParams: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    }) as ReactElement<{
      children: ReactElement<{ children: ReactElement<{ organizationId: string }>[] }>;
    }>;
    const panels = shell.props.children.props.children;

    expect(panels).toHaveLength(2);
    expect(panels.map(panel => panel.type)).toEqual([OwnerStaffManager, OwnerTeamAccessPanel]);
    expect(panels.map(panel => panel.key)).toEqual([`staff:${ORGANIZATION_ID}`, `access:${ORGANIZATION_ID}`]);
    expect(panels.every(panel => panel.props.organizationId === ORGANIZATION_ID)).toBe(true);
  });

  it.each([
    { role: "admin", locationScopeMode: "all" },
    { role: "owner", locationScopeMode: "selected" },
    { role: "manager", locationScopeMode: "all" },
    { role: "coach", locationScopeMode: "all" },
  ])("deniega $role con alcance $locationScopeMode", async ({ role, locationScopeMode }) => {
    pageMocks.role = role;
    pageMocks.locationScopeMode = locationScopeMode;
    await expect(OwnerStaffPage({
      searchParams: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("redirige una sesión ausente al inicio de sesión", async () => {
    pageMocks.userId = null;
    await expect(OwnerStaffPage({ searchParams: Promise.resolve({ organizationId: ORGANIZATION_ID }) }))
      .rejects.toThrow("NEXT_REDIRECT:/auth/login?next=/owner/staff");
  });
});
