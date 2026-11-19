import { describe, expect, it } from "vitest";

import { ownerWorkspaceCapabilitiesFor } from "@/components/owner-dashboard/owner-workspace-capabilities";

describe("canManageStaffProfiles", () => {
  it("solo se concede al Owner canónico con alcance de todas las sedes", () => {
    expect(ownerWorkspaceCapabilitiesFor({ role: "owner", locationScopeMode: "all" }).canManageStaffProfiles).toBe(true);
    expect(ownerWorkspaceCapabilitiesFor({ role: "owner", locationScopeMode: "selected" }).canManageStaffProfiles).toBe(false);
    expect(ownerWorkspaceCapabilitiesFor({ role: "admin", locationScopeMode: "all" }).canManageStaffProfiles).toBe(false);
    expect(ownerWorkspaceCapabilitiesFor({ role: "manager", locationScopeMode: "all" }).canManageStaffProfiles).toBe(false);
    expect(ownerWorkspaceCapabilitiesFor({ role: "coach", locationScopeMode: "all" }).canManageStaffProfiles).toBe(false);
  });
});
