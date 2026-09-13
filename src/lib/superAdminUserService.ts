import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  athletes,
  classes,
  coaches,
  memberships,
  plans,
  profiles,
  subscriptions,
} from "@/db/schema";
import { getAuthUserEmail } from "@/lib/supabase/admin-operations";

const profileIdSchema = z.string().uuid();

export interface SuperAdminUserDetail {
  id: string;
  userId: string;
  name: string | null;
  role: string;
  tenantId: string;
  activeAcademyId: string | null;
  isSuspended: boolean;
  canLogin: boolean;
  createdAt: string | null;
  email: string | null;
  subscription: {
    id: string;
    planId: string | null;
    planCode: string | null;
    planNickname: string | null;
    status: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  } | null;
  memberships: Array<{
    id: string;
    academyId: string;
    role: string | null;
    academyName: string | null;
    academyType: string | null;
  }>;
  stats: {
    academiesOwned: number;
    totalAthletes: number;
    totalCoaches: number;
    totalClasses: number;
  };
}

/**
 * Loads a privileged user detail directly from the database and Auth admin
 * API. Server components should call this instead of fetching their own API
 * route, which avoids host-header routing and an unnecessary HTTP round trip.
 */
export async function getSuperAdminUserDetail(
  profileId: string
): Promise<SuperAdminUserDetail | null> {
  if (!profileIdSchema.safeParse(profileId).success) return null;

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

  if (!profile) return null;

  // These reads share the same profile key and do not depend on one another.
  // Run them together so the privileged detail view does not pay seven
  // sequential database/Auth round trips.
  const [userMemberships, subscriptionRows, ownedAcademies, authEmail] =
    await Promise.all([
      db
        .select({
          id: memberships.id,
          academyId: memberships.academyId,
          role: memberships.role,
          academyName: academies.name,
          academyType: academies.academyType,
        })
        .from(memberships)
        .leftJoin(academies, eq(memberships.academyId, academies.id))
        .where(eq(memberships.userId, profile.userId)),
      db
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
        .limit(1),
      db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.ownerId, profile.id)),
      getAuthUserEmail(profile.userId),
    ]);

  const userSubscription = subscriptionRows[0];

  const academyIds = ownedAcademies.map((academy) => academy.id);
  const stats = {
    academiesOwned: ownedAcademies.length,
    totalAthletes: 0,
    totalCoaches: 0,
    totalClasses: 0,
  };

  if (academyIds.length > 0) {
    const [[athletesResult], [coachesResult], [classesResult]] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(*)` })
          .from(athletes)
          .where(
            and(
              inArray(athletes.academyId, academyIds),
              isNull(athletes.deletedAt)
            )
          ),
        db
          .select({ count: sql<number>`count(*)` })
          .from(coaches)
          .where(inArray(coaches.academyId, academyIds)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(classes)
          .where(
            and(
              inArray(classes.academyId, academyIds),
              isNull(classes.deletedAt)
            )
          ),
      ]);

    stats.totalAthletes = Number(athletesResult?.count ?? 0);
    stats.totalCoaches = Number(coachesResult?.count ?? 0);
    stats.totalClasses = Number(classesResult?.count ?? 0);
  }

  return {
    ...profile,
    createdAt: profile.createdAt
      ? new Date(profile.createdAt).toISOString()
      : null,
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
