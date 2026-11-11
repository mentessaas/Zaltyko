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

type NavigationProps = {
  capabilities?: ReturnType<typeof ownerWorkspaceCapabilitiesFor>;
  organizationId?: string | null;
  locationId?: string | null;
  previewMode: boolean;
};

/**
 * Server-only: reads the cached team-access availability (flag AND the exact
 * reviewed schema) before granting the Equipo entry. Only rendered when the
 * flag is on and the member may manage invitations, so every other page,
 * preview and test keeps the synchronous shell.
 */
async function TeamAwareNavigation({ member, ...props }: Omit<NavigationProps, "capabilities"> & { member: MemberCapabilities }) {
  const capabilities = ownerWorkspaceCapabilitiesFor(member, {
    teamAccessEnabled: await isCanonicalTeamAccessAvailableCached(),
  });
  return <OwnerWorkspaceNavigation capabilities={capabilities} {...props} />;
}

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
  const checkTeamAccess = !previewMode && Boolean(member) && process.env.ZALTYKO_TEAM_ACCESS_ENABLED === "true"
    && mayManageTeamAccess(member!);
  const capabilities = previewMode
    ? previewCapabilities
    : member
      ? ownerWorkspaceCapabilitiesFor(member)
      : undefined;

  return (
    <div className="min-h-screen bg-z-canvas text-z-ink">
      {checkTeamAccess ? (
        <TeamAwareNavigation member={member!} organizationId={organizationId} locationId={locationId} previewMode={previewMode} />
      ) : (
        <OwnerWorkspaceNavigation
          capabilities={capabilities}
          organizationId={organizationId}
          locationId={locationId}
          previewMode={previewMode}
        />
      )}
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
