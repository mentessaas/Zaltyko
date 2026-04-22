import { and, asc, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { academies, invitations, memberships, profiles } from "@/db/schema";
import type { MembershipRole, ProfileRole } from "@/lib/product/roles";
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

export function buildInvitationAcceptancePath(role: string, token: string): string {
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

  const [profile] = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      role: profiles.role,
      tenantId: profiles.tenantId,
      activeAcademyId: profiles.activeAcademyId,
      canLogin: profiles.canLogin,
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
          redirectUrl: buildInvitationAcceptancePath(pendingInvitation.role, pendingInvitation.token),
          reason: "pending-invitation",
          profileRole: null,
          membershipRole: null,
          activeAcademyId: null,
        };
      }
    }

    return {
      destination: "owner_setup",
      redirectUrl: "/onboarding/owner",
      reason: "missing-profile",
      profileRole: null,
      membershipRole: null,
      activeAcademyId: null,
    };
  }

  if (!profile.canLogin && profile.role !== "super_admin") {
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

  const membershipsRows = await db
    .select({
      academyId: memberships.academyId,
      role: memberships.role,
    })
    .from(memberships)
    .where(eq(memberships.userId, args.userId))
    .orderBy(asc(memberships.createdAt));

  const activeMembership =
    membershipsRows.find((membership) => membership.academyId === profile.activeAcademyId) ??
    membershipsRows[0] ??
    null;

  let academyId = profile.activeAcademyId ?? activeMembership?.academyId ?? null;

  if (!academyId && (profile.role === "owner" || profile.role === "admin")) {
    const [academy] = await db
      .select({ id: academies.id })
      .from(academies)
      .where(eq(academies.tenantId, profile.tenantId))
      .orderBy(asc(academies.name))
      .limit(1);

    academyId = academy?.id ?? null;
  }

  const membershipRole = (activeMembership?.role ?? null) as MembershipRole | null;

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

  return {
    destination: "global_dashboard",
    redirectUrl: getDefaultDashboardPath(profile.role),
    reason: academyId ? "limited-global" : "no-academy",
    profileRole: isProfileRole(profile.role) ? profile.role : null,
    membershipRole,
    activeAcademyId: academyId,
  };
}
