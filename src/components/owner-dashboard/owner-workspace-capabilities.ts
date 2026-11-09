export type OwnerWorkspaceCapabilities = Readonly<{
  canManageOrganizationAthletes: boolean;
  canManageFinancials: boolean;
  canManageSubscription: boolean;
  canManageStaffProfiles: boolean;
  /**
   * Coach seat (P1 #8): the workspace only offers taking attendance (with
   * today's sessions). Route guards stay authoritative; this only trims the UI.
   */
  coachOperationsOnly: boolean;
}>;

export function ownerWorkspaceCapabilitiesFor(member: {
  role: string;
  locationScopeMode: string;
}): OwnerWorkspaceCapabilities {
  const canManageFinancials = member.role === "owner" || member.role === "admin";

  return {
    canManageOrganizationAthletes:
      canManageFinancials && member.locationScopeMode === "all",
    canManageFinancials,
    canManageSubscription: member.role === "owner",
    canManageStaffProfiles:
      member.role === "owner" && member.locationScopeMode === "all",
    coachOperationsOnly: member.role === "coach",
  };
}
