import type { ReactNode } from "react";

import { OwnerWorkspaceNavigation } from "./OwnerWorkspaceNavigation";
import { ownerWorkspaceCapabilitiesFor } from "./owner-workspace-capabilities";

type MemberCapabilities = Readonly<{
  role: string;
  locationScopeMode: string;
}>;

const previewCapabilities = {
  canManageOrganizationAthletes: true,
  canManageFinancials: true,
  canManageSubscription: true,
  canManageStaffProfiles: true,
  canManageTeamAccess: false,
  coachOperationsOnly: false,
} as const;

export function OwnerWorkspacePageShell({
  children,
  member,
  organizationId,
  locationId,
  previewMode = false,
}: {
  children: ReactNode;
  member?: MemberCapabilities | null;
  organizationId?: string | null;
  locationId?: string | null;
  previewMode?: boolean;
}) {
  const capabilities = previewMode
    ? previewCapabilities
    : member
      ? ownerWorkspaceCapabilitiesFor(member, {
          // Server component: the flag never reaches the client bundle.
          teamAccessEnabled: process.env.ZALTYKO_TEAM_ACCESS_ENABLED === "true",
        })
      : undefined;

  return (
    <div className="min-h-screen bg-z-canvas text-z-ink">
      <OwnerWorkspaceNavigation
        capabilities={capabilities}
        organizationId={organizationId}
        locationId={locationId}
        previewMode={previewMode}
      />
      <div
        id="owner-workspace-content"
        tabIndex={-1}
        className="peer-data-[owner-sidebar]:pb-24 xl:peer-data-[owner-sidebar]:pb-0 xl:peer-data-[owner-sidebar]:pl-[248px]"
      >
        {children}
      </div>
    </div>
  );
}
