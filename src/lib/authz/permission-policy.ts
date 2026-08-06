import type { Permission } from "@/db/schema/permissions";

export type AcademyMembershipRole = "owner" | "coach" | "viewer";

const COACH_BASELINE_PERMISSIONS: readonly Permission[] = [
  "athletes:read",
  "athletes:update",
  "classes:read",
  "classes:schedule",
  "reports:read",
  "events:read",
  "communications:read",
  "communications:send",
];

const LIMITED_PORTAL_PERMISSIONS: readonly Permission[] = [
  "communications:read",
  "communications:send",
];

/**
 * Baseline capabilities apply only when there is no custom role assignment.
 * The global profile role can narrow a viewer to the limited family/athlete
 * portal, but it never promotes a membership to academy administration.
 */
export function getBaselinePermissions({
  membershipRole,
  profileRole,
  allPermissions,
}: {
  membershipRole: AcademyMembershipRole;
  profileRole: string;
  allPermissions: readonly Permission[];
}): Permission[] {
  if (membershipRole === "owner") {
    return [...allPermissions];
  }

  if (membershipRole === "coach") {
    return [...COACH_BASELINE_PERMISSIONS];
  }

  if (profileRole === "parent" || profileRole === "athlete") {
    return [...LIMITED_PORTAL_PERMISSIONS];
  }

  return [];
}

export function grantsRequiredPermission(
  effectivePermissions: { permissions: readonly Permission[]; isOwner: boolean },
  requiredPermission: Permission
): boolean {
  return (
    effectivePermissions.isOwner ||
    effectivePermissions.permissions.includes(requiredPermission)
  );
}
