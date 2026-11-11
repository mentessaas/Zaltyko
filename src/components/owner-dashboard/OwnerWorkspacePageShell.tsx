import type { ReactNode } from "react";

import { OwnerWorkspaceNavigation } from "./OwnerWorkspaceNavigation";
import { isCanonicalTeamAccessAvailableCached } from "@/modules/staff/application/canonical-team-access";

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

/** Roles that may manage team invitations (O3) when the feature is available. */
function mayManageTeamAccess(member: MemberCapabilities): boolean {
  return ((member.role === "owner" || member.role === "admin") && member.locationScopeMode === "all") || member.role === "manager";
}

export async function OwnerWorkspacePageShell({
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
          // Server component: flag AND the exact reviewed schema, cached
          // briefly; nothing reaches the client bundle.
          teamAccessEnabled: mayManageTeamAccess(member) ? await isCanonicalTeamAccessAvailableCached() : false,
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
