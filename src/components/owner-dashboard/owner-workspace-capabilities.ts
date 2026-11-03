export type OwnerWorkspaceCapabilities = Readonly<{
  canManageOrganizationAthletes: boolean;
  canManageFinancials: boolean;
  canManageSubscription: boolean;
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
  };
}
