import { describe, expect, it } from "vitest";

import { ownerWorkspaceCapabilitiesFor } from "@/components/owner-dashboard/owner-workspace-capabilities";
import { getLimitForRoute } from "@/lib/rate-limit";

describe("O3 · límites y entrada de las invitaciones de equipo", () => {
  it("abrir o aceptar un enlace tiene un límite propio y estricto por cuenta", () => {
    expect(getLimitForRoute("/api/v1/staff/invitations/inspect")).toEqual({ limit: 10, window: 60 });
    expect(getLimitForRoute("/api/v1/staff/invitations/accept")).toEqual({ limit: 10, window: 60 });
    // La gestión desde /owner conserva su límite general.
    expect(getLimitForRoute("/api/v1/owner/staff/invitations")).not.toEqual({ limit: 10, window: 60 });
  });

  it("Equipo se abre a quien gestiona invitaciones solo con la función activa", () => {
    const enabled = { teamAccessEnabled: true };
    expect(ownerWorkspaceCapabilitiesFor({ role: "owner", locationScopeMode: "all" }, enabled).canManageTeamAccess).toBe(true);
    expect(ownerWorkspaceCapabilitiesFor({ role: "admin", locationScopeMode: "all" }, enabled).canManageTeamAccess).toBe(true);
    expect(ownerWorkspaceCapabilitiesFor({ role: "manager", locationScopeMode: "selected" }, enabled).canManageTeamAccess).toBe(true);
    expect(ownerWorkspaceCapabilitiesFor({ role: "admin", locationScopeMode: "selected" }, enabled).canManageTeamAccess).toBe(false);
    expect(ownerWorkspaceCapabilitiesFor({ role: "owner", locationScopeMode: "selected" }, enabled).canManageTeamAccess).toBe(false);
    expect(ownerWorkspaceCapabilitiesFor({ role: "coach", locationScopeMode: "all" }, enabled).canManageTeamAccess).toBe(false);
    for (const role of ["owner", "admin", "manager"]) {
      expect(ownerWorkspaceCapabilitiesFor({ role, locationScopeMode: "all" }).canManageTeamAccess).toBe(false);
    }
  });
});
