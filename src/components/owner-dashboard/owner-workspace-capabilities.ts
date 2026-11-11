export type OwnerWorkspaceCapabilities = Readonly<{
  canManageOrganizationAthletes: boolean;
  canManageFinancials: boolean;
  canManageSubscription: boolean;
  canManageStaffProfiles: boolean;
  /**
   * O3: team invitations (owner/admin with every site, or a manager) while
   * ZALTYKO_TEAM_ACCESS_ENABLED is on. Opens Equipo for admins and managers.
   */
  canManageTeamAccess: boolean;
  /**
   * Coach seat (P1 #8): the workspace only offers taking attendance (with
   * today's sessions). Route guards stay authoritative; this only trims the UI.
   */
  coachOperationsOnly: boolean;
}>;

export function ownerWorkspaceCapabilitiesFor(
  member: {
    role: string;
    locationScopeMode: string;
  },
  options: { teamAccessEnabled?: boolean } = {}
): OwnerWorkspaceCapabilities {
  const canManageFinancials = member.role === "owner" || member.role === "admin";

  return {
    canManageOrganizationAthletes:
      canManageFinancials && member.locationScopeMode === "all",
    canManageFinancials,
    canManageSubscription: member.role === "owner",
    canManageStaffProfiles:
      member.role === "owner" && member.locationScopeMode === "all",
    canManageTeamAccess:
      options.teamAccessEnabled === true &&
      (((member.role === "owner" || member.role === "admin") &&
        member.locationScopeMode === "all") ||
        member.role === "manager"),
    coachOperationsOnly: member.role === "coach",
  };
}
