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
      ? ownerWorkspaceCapabilitiesFor(member)
      : undefined;

  return (
    <>
      <OwnerWorkspaceNavigation
        capabilities={capabilities}
        organizationId={organizationId}
        locationId={locationId}
        previewMode={previewMode}
      />
      <div id="owner-workspace-content" tabIndex={-1}>
        {children}
      </div>
    </>
  );
}
