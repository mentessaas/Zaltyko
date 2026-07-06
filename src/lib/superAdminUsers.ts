import { inArray, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { academies, athletes, classes, coaches, memberships, plans, profiles, subscriptions } from "@/db/schema";
import { getAuthUserEmail } from "@/lib/supabase/admin-operations";

export const SUPER_ADMIN_PROFILE_ROLES = [
  "super_admin",
  "owner",
  "admin",
  "coach",
  "athlete",
  "parent",
] as const;

export type SuperAdminProfileRole = (typeof SUPER_ADMIN_PROFILE_ROLES)[number];

export function isSuperAdminProfileRole(role: unknown): role is SuperAdminProfileRole {
  return typeof role === "string" && SUPER_ADMIN_PROFILE_ROLES.includes(role as SuperAdminProfileRole);
}

export async function getSuperAdminUserDetail(profileId: string) {
  const [profile] = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      name: profiles.name,
      role: profiles.role,
      tenantId: profiles.tenantId,
      activeAcademyId: profiles.activeAcademyId,
      isSuspended: profiles.isSuspended,
      canLogin: profiles.canLogin,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!profile) {
    return null;
  }

  const userMemberships = await db
    .select({
      id: memberships.id,
      academyId: memberships.academyId,
      role: memberships.role,
      academyName: academies.name,
      academyType: academies.academyType,
    })
    .from(memberships)
    .leftJoin(academies, eq(memberships.academyId, academies.id))
    .where(eq(memberships.userId, profile.userId));

  const [userSubscription] = await db
    .select({
      id: subscriptions.id,
      planId: subscriptions.planId,
      planCode: plans.code,
      planNickname: plans.nickname,
      status: subscriptions.status,
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
    })
    .from(subscriptions)
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, profile.userId))
    .limit(1);

  const ownedAcademies = await db
    .select({ id: academies.id })
    .from(academies)
    .where(eq(academies.ownerId, profile.id));

  const academyIds = ownedAcademies.map((academy) => academy.id);

  const stats = {
    academiesOwned: ownedAcademies.length,
    totalAthletes: 0,
    totalCoaches: 0,
    totalClasses: 0,
  };

  if (academyIds.length > 0) {
    const [athletesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(athletes)
      .where(inArray(athletes.academyId, academyIds));

    const [coachesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(coaches)
      .where(inArray(coaches.academyId, academyIds));

    const [classesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .where(inArray(classes.academyId, academyIds));

    stats.totalAthletes = Number(athletesResult?.count ?? 0);
    stats.totalCoaches = Number(coachesResult?.count ?? 0);
    stats.totalClasses = Number(classesResult?.count ?? 0);
  }

  const authEmail = await getAuthUserEmail(profile.userId);

  return {
    ...profile,
    createdAt: profile.createdAt?.toISOString() ?? null,
    email: authEmail,
    subscription: userSubscription
      ? {
          id: userSubscription.id,
          planId: userSubscription.planId,
          planCode: userSubscription.planCode,
          planNickname: userSubscription.planNickname,
          status: userSubscription.status,
          stripeCustomerId: userSubscription.stripeCustomerId,
          stripeSubscriptionId: userSubscription.stripeSubscriptionId,
        }
      : null,
    memberships: userMemberships.map((membership) => ({
      id: membership.id,
      academyId: membership.academyId,
      role: membership.role,
      academyName: membership.academyName,
      academyType: membership.academyType,
    })),
    stats,
  };
}
