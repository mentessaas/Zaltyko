import { and, asc, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { invitations, profiles } from "@/db/schema";
import type { MembershipRole, ProfileRole } from "@/lib/product/roles";
import {
  findLegacyAcademyMemberships,
  inspectLegacyAcademySchema,
  isAvailableLegacyAcademy,
} from "@/lib/auth/legacy-academy-access";
import {
  canAccessAcademyWorkspace,
  getDefaultDashboardPath,
  isProfileRole,
} from "@/lib/product/roles";

export type UserHomeDestination =
  | "super_admin"
  | "global_dashboard"
  | "academy_workspace"
  | "invite_acceptance"
  | "owner_setup"
  | "blocked";

export interface ResolveUserHomeResult {
  destination: UserHomeDestination;
  redirectUrl: string;
  reason: string;
  profileRole: ProfileRole | null;
  membershipRole: MembershipRole | null;
  activeAcademyId: string | null;
}

export function buildInvitationAcceptancePath(
  role: string,
  token: string
): string {
  if (role === "parent") {
    return `/invite/parent?token=${token}`;
  }

  if (role === "athlete") {
    return `/invite/athlete?token=${token}`;
  }

  return `/invite/accept?token=${token}`;
}

export async function resolveUserHome(args: {
  userId: string;
  email?: string | null;
}): Promise<ResolveUserHomeResult> {
  const normalizedEmail = args.email?.trim().toLowerCase() ?? null;
  const legacySchemaState = await inspectLegacyAcademySchema((query) =>
    db.execute(query)
  );

  if (legacySchemaState === "absent") {
    return {
      destination: "owner_setup",
      redirectUrl: "/owner/setup",
      reason: "legacy-schema-absent",
      profileRole: null,
      membershipRole: null,
      activeAcademyId: null,
    };
  }

  const [profile] = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      role: profiles.role,
      tenantId: profiles.tenantId,
      activeAcademyId: profiles.activeAcademyId,
      canLogin: profiles.canLogin,
      isSuspended: profiles.isSuspended,
    })
    .from(profiles)
    .where(eq(profiles.userId, args.userId))
    .limit(1);

  if (!profile) {
    if (normalizedEmail) {
      const [pendingInvitation] = await db
        .select({
          token: invitations.token,
          role: invitations.role,
        })
        .from(invitations)
        .where(
          and(
            eq(invitations.email, normalizedEmail),
            eq(invitations.status, "pending"),
            gt(invitations.expiresAt, new Date())
          )
        )
        .orderBy(asc(invitations.createdAt))
        .limit(1);

      if (pendingInvitation) {
        return {
          destination: "invite_acceptance",
          redirectUrl: buildInvitationAcceptancePath(
            pendingInvitation.role,
            pendingInvitation.token
          ),
          reason: "pending-invitation",
          profileRole: null,
          membershipRole: null,
          activeAcademyId: null,
        };
      }
    }

    return {
      destination: "owner_setup",
      redirectUrl: "/owner/setup",
      reason: "missing-profile",
      profileRole: null,
      membershipRole: null,
      activeAcademyId: null,
    };
  }

  if (
    profile.isSuspended ||
    (!profile.canLogin && profile.role !== "super_admin")
  ) {
    return {
      destination: "blocked",
      redirectUrl: "/auth/login?error=access_disabled",
      reason: "login-disabled",
      profileRole: profile.role,
      membershipRole: null,
      activeAcademyId: profile.activeAcademyId,
    };
  }

  if (profile.role === "super_admin") {
    return {
      destination: "super_admin",
      redirectUrl: "/super-admin",
      reason: "super-admin",
      profileRole: profile.role,
      membershipRole: null,
      activeAcademyId: null,
    };
  }

  const legacyRows = (
    await findLegacyAcademyMemberships(args.userId, legacySchemaState)
  ).filter(
    (row) =>
      row.profileId === profile.id &&
      row.profileUserId === args.userId &&
      row.profileRole === profile.role &&
      row.profileTenantId === profile.tenantId &&
      row.academyTenantId === profile.tenantId &&
      isAvailableLegacyAcademy(row)
  );
  const ownerOrAdmin = profile.role === "owner" || profile.role === "admin";
  // membership_role legacy no incluye "admin": un perfil admin conserva
  // acceso solo con relación owner o propiedad directa de esa academia.
  const eligibleRows = ownerOrAdmin
    ? legacyRows.filter(
        (row) =>
          row.profileId === profile.id &&
          (row.academyOwnerId === profile.id || row.membershipRole === "owner")
      )
    : legacyRows.filter((row) => row.membershipUserId === args.userId);
  const activeMembership =
    eligibleRows.find(
      (membership) => membership.academyId === profile.activeAcademyId
    ) ??
    eligibleRows[0] ??
    null;

  // activeAcademyId solo selecciona entre relaciones verificadas; nunca crea
  // acceso por sí mismo ni permite elegir una academia de otro tenant.
  const academyId = activeMembership?.academyId ?? null;
  const membershipRole = (activeMembership?.membershipRole ??
    null) as MembershipRole | null;

  if (
    academyId &&
    profile.role === "coach" &&
    canAccessAcademyWorkspace(profile.role, membershipRole)
  ) {
    return {
      destination: "academy_workspace",
      redirectUrl: `/app/${academyId}/coach`,
      reason: "coach-academy-access",
      profileRole: profile.role,
      membershipRole,
      activeAcademyId: academyId,
    };
  }

  if (
    academyId &&
    (profile.role === "owner" || profile.role === "admin") &&
    canAccessAcademyWorkspace(
      profile.role,
      membershipRole,
      activeMembership?.academyOwnerId === profile.id
    )
  ) {
    return {
      destination: "academy_workspace",
      redirectUrl: `/app/${academyId}/dashboard`,
      reason: "legacy-owner-membership",
      profileRole: profile.role,
      membershipRole,
      activeAcademyId: academyId,
    };
  }

  if (academyId && canAccessAcademyWorkspace(profile.role, membershipRole)) {
    return {
      destination: "academy_workspace",
      redirectUrl: `/app/${academyId}/dashboard`,
      reason: "academy-access",
      profileRole: profile.role,
      membershipRole,
      activeAcademyId: academyId,
    };
  }

  if (
    academyId &&
    activeMembership &&
    (profile.role === "athlete" || profile.role === "parent")
  ) {
    return {
      destination: "academy_workspace",
      redirectUrl: `/app/${academyId}/my-dashboard`,
      reason: "limited-academy-access",
      profileRole: profile.role,
      membershipRole,
      activeAcademyId: academyId,
    };
  }

  // An owner/admin account is not usable until its first academy exists.
  // Keep this invariant server-side so login, callbacks and legacy dashboard
  // routes cannot leave a newly registered owner in the global dashboard.
  if (!academyId && (profile.role === "owner" || profile.role === "admin")) {
    return {
      destination: "owner_setup",
      redirectUrl: "/owner/setup",
      reason: "no-academy",
      profileRole: isProfileRole(profile.role) ? profile.role : null,
      membershipRole,
      activeAcademyId: null,
    };
  }

  return {
    destination: "global_dashboard",
    redirectUrl: getDefaultDashboardPath(profile.role),
    reason: academyId ? "limited-global" : "no-academy",
    profileRole: isProfileRole(profile.role) ? profile.role : null,
    membershipRole,
    activeAcademyId: academyId,
  };
}
