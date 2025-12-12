import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export interface SuperAdminMetrics {
  totals: {
    academies: number;
    users: number;
    revenue: number;
    paidInvoices: number;
    assessments: number;
    plans: number;
    subscriptions: number;
    latestAcademyAt: string | null;
    // Metrics for student charges
    activeAcademies: number; // Academies with at least 1 athlete/group
    totalAthletes: number;
    chargesCreatedThisMonth: number;
    chargesPaidThisMonth: number; // Amount in cents
    recentActivityAcademies: number; // Academies with events in last 7 days
  };
  usersByRole: Array<{ role: string; total: number }>;
  planStatuses: Array<{ status: string; total: number }>;
  planDistribution: Array<{ code: string; nickname: string | null; total: number }>;
  monthlyAcademies: Array<{ label: string; total: number }>;
}

export interface SuperAdminAcademyRow {
  id: string;
  name: string | null;
  academyType: string | null;
  country: string | null;
  region: string | null;
  planCode: string | null;
  planNickname: string | null;
  createdAt: string | null;
  isSuspended: boolean;
}

export interface SuperAdminUserRow {
  id: string;
  fullName: string | null;
  email: string | null;
  role: string | null;
  academyId: string | null;
  createdAt: string | null;
  membershipRoles: string[];
  isSuspended: boolean;
  planCode: string | null;
  planNickname: string | null;
}

function getClient(): SupabaseClient {
  return getSupabaseAdminClient();
}

function toIso(value: string | Date | null | undefined) {
  if (!value) return null;
  try {
    const date = typeof value === "string" ? new Date(value) : value;
    return date.toISOString();
  } catch {
    return null;
  }
}

export async function getGlobalStats(): Promise<SuperAdminMetrics> {
  // Use Drizzle directly to bypass RLS and get all data
  const { db } = await import("@/db");
  const { academies, profiles, plans, subscriptions, billingInvoices, athleteAssessments, athletes, groups, charges, eventLogs } = await import("@/db/schema");
  const { desc, gte } = await import("drizzle-orm");

  // Get current month for charge metrics
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    academiesList,
    profilesList,
    plansList,
    subscriptionsList,
    invoicesList,
    assessmentsList,
    athletesList,
    groupsList,
    chargesList,
    eventLogsList,
  ] = await Promise.all([
      db.select({
        id: academies.id,
        createdAt: academies.createdAt,
      })
        .from(academies)
        .orderBy(desc(academies.createdAt)),
      db.select({
        id: profiles.id,
        role: profiles.role,
      }).from(profiles),
      db.select({
        id: plans.id,
        code: plans.code,
        nickname: plans.nickname,
      }).from(plans),
      db.select({
        id: subscriptions.id,
        planId: subscriptions.planId,
        status: subscriptions.status,
      }).from(subscriptions),
      db.select({
        id: billingInvoices.id,
        amountPaid: billingInvoices.amountPaid,
        status: billingInvoices.status,
      }).from(billingInvoices),
      db.select({
        id: athleteAssessments.id,
      }).from(athleteAssessments),
      db.select({
        id: athletes.id,
        academyId: athletes.academyId,
      }).from(athletes),
      db.select({
        id: groups.id,
        academyId: groups.academyId,
      }).from(groups),
      db.select({
        id: charges.id,
        academyId: charges.academyId,
        period: charges.period,
        status: charges.status,
        amountCents: charges.amountCents,
      }).from(charges),
      db.select({
        id: eventLogs.id,
        academyId: eventLogs.academyId,
        createdAt: eventLogs.createdAt,
      })
        .from(eventLogs)
        .where(gte(eventLogs.createdAt, sevenDaysAgo)),
    ]);

  const academiesData = academiesList;
  const users = profilesList;
  const plansData = plansList;
  const subscriptionsData = subscriptionsList;
  const invoices = invoicesList;
  const assessments = assessmentsList;

  const usersByRoleMap = new Map<string, number>();
  for (const user of users) {
    const role = user.role ?? "unknown";
    usersByRoleMap.set(role, (usersByRoleMap.get(role) ?? 0) + 1);
  }

  const planStatusMap = new Map<string, number>();
  const planDistributionMap = new Map<string, { code: string; nickname: string | null; total: number }>();

  const planLookup = new Map<string, { code: string; nickname: string | null }>();
  for (const plan of plansData) {
    planLookup.set(plan.id, { code: plan.code ?? "custom", nickname: plan.nickname ?? null });
  }

  for (const subscription of subscriptionsData) {
    const status = subscription.status ?? "unknown";
    planStatusMap.set(status, (planStatusMap.get(status) ?? 0) + 1);

    const planInfo = planLookup.get(subscription.planId ?? "") ?? { code: "custom", nickname: null };
    const key = planInfo.code;
    const entry = planDistributionMap.get(key) ?? { code: planInfo.code, nickname: planInfo.nickname, total: 0 };
    entry.total += 1;
    planDistributionMap.set(key, entry);
  }

  const monthlyMap = new Map<string, number>();
  for (const academy of academiesData) {
    const createdAt = academy.createdAt;
    if (!createdAt) continue;
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(label, (monthlyMap.get(label) ?? 0) + 1);
  }

  const monthlyAcademies = Array.from(monthlyMap.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(-6);

  const totalRevenue = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + (invoice.amountPaid ?? 0), 0);

  const latestAcademyAt = academiesData.length > 0 ? toIso(academiesData[0].createdAt) : null;

  // Calculate active academies (with at least 1 athlete or group)
  const academiesWithAthletes = new Set(athletesList.map((a) => a.academyId));
  const academiesWithGroups = new Set(groupsList.map((g) => g.academyId));
  const activeAcademiesSet = new Set([...academiesWithAthletes, ...academiesWithGroups]);
  const activeAcademies = activeAcademiesSet.size;

  // Calculate charge metrics for current month
  const chargesThisMonth = chargesList.filter((c) => c.period === currentMonth);
  const chargesCreatedThisMonth = chargesThisMonth.length;
  const chargesPaidThisMonth = chargesThisMonth
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + (c.amountCents ?? 0), 0);

  // Calculate academies with recent activity (events in last 7 days)
  const academiesWithRecentActivity = new Set(
    eventLogsList.map((e) => e.academyId).filter((id): id is string => id !== null)
  );

  return {
    totals: {
      academies: academiesData.length,
      users: users.length,
      revenue: totalRevenue,
      paidInvoices: invoices.filter((invoice) => invoice.status === "paid").length,
      assessments: assessments.length,
      plans: plansData.length,
      subscriptions: subscriptionsData.length,
      latestAcademyAt,
      activeAcademies,
      totalAthletes: athletesList.length,
      chargesCreatedThisMonth,
      chargesPaidThisMonth,
      recentActivityAcademies: academiesWithRecentActivity.size,
    },
    usersByRole: Array.from(usersByRoleMap.entries()).map(([role, total]) => ({ role, total })),
    planStatuses: Array.from(planStatusMap.entries()).map(([status, total]) => ({ status, total })),
    planDistribution: Array.from(planDistributionMap.values()),
    monthlyAcademies,
  };
}

export async function getAllAcademies(): Promise<SuperAdminAcademyRow[]> {
  // Use Drizzle directly to bypass RLS and get all academies
  const { db } = await import("@/db");
  const { academies, profiles, subscriptions, plans } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const [academiesList, profilesList, subscriptionsList, plansList] = await Promise.all([
    db.select({
      id: academies.id,
      name: academies.name,
      academyType: academies.academyType,
      country: academies.country,
      region: academies.region,
      createdAt: academies.createdAt,
      isSuspended: academies.isSuspended,
      ownerId: academies.ownerId,
    }).from(academies),
    db.select({
      id: profiles.id,
      userId: profiles.userId,
    }).from(profiles),
    db.select({
      userId: subscriptions.userId,
      planId: subscriptions.planId,
      status: subscriptions.status,
    }).from(subscriptions).where(eq(subscriptions.status, "active")),
    db.select({
      id: plans.id,
      code: plans.code,
      nickname: plans.nickname,
    }).from(plans),
  ]);

  // Create lookup: profileId -> userId
  const profileToUser = new Map<string, string>();
  for (const profile of profilesList) {
    if (profile.id && profile.userId) {
      profileToUser.set(profile.id, profile.userId);
    }
  }

  // Create lookup: userId -> plan info
  const planLookup = new Map<string, { code: string; nickname: string | null }>();
  for (const plan of plansList) {
    planLookup.set(plan.id, { code: plan.code ?? "custom", nickname: plan.nickname ?? null });
  }

  const subscriptionLookup = new Map<string, { code: string; nickname: string | null }>();
  for (const subscription of subscriptionsList) {
    if (subscription.userId && subscription.planId) {
      const planInfo = planLookup.get(subscription.planId);
      if (planInfo) {
        subscriptionLookup.set(subscription.userId, planInfo);
      }
    }
  }

  return academiesList.map((academy) => {
    let planInfo: { code: string; nickname: string | null } | null = null;
    
    if (academy.ownerId) {
      const userId = profileToUser.get(academy.ownerId);
      if (userId) {
        planInfo = subscriptionLookup.get(userId) ?? null;
      }
    }

    return {
      id: academy.id,
      name: academy.name ?? null,
      academyType: academy.academyType ?? null,
      country: academy.country ?? null,
      region: academy.region ?? null,
      planCode: planInfo?.code ?? null,
      planNickname: planInfo?.nickname ?? null,
      createdAt: toIso(academy.createdAt),
      isSuspended: Boolean(academy.isSuspended),
    };
  });
}

export async function getAllUsers(): Promise<SuperAdminUserRow[]> {
  // Use Drizzle directly to bypass RLS and get all profiles
  const { db } = await import("@/db");
  const { profiles, memberships, subscriptions, plans } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const supabase = getClient();

  const [profilesList, membershipsList, subscriptionsList, plansList, authUsers] = await Promise.all([
    db.select({
      id: profiles.id,
      userId: profiles.userId,
      name: profiles.name,
      role: profiles.role,
      activeAcademyId: profiles.activeAcademyId,
      createdAt: profiles.createdAt,
      isSuspended: profiles.isSuspended,
    }).from(profiles),
    db.select({
      userId: memberships.userId,
      role: memberships.role,
    }).from(memberships),
    db.select({
      userId: subscriptions.userId,
      planId: subscriptions.planId,
      status: subscriptions.status,
    }).from(subscriptions),
    db.select({
      id: plans.id,
      code: plans.code,
      nickname: plans.nickname,
    }).from(plans),
    fetchAllAuthUsers(supabase),
  ]);

  const authUserLookup = new Map<string, User>();
  authUsers.forEach((user) => {
    if (user?.id) {
      authUserLookup.set(user.id, user);
    }
  });

  const membershipLookup = new Map<string, Set<string>>();
  for (const membership of membershipsList) {
    if (!membership.userId || !membership.role) continue;
    if (!membershipLookup.has(membership.userId)) {
      membershipLookup.set(membership.userId, new Set());
    }
    membershipLookup.get(membership.userId)!.add(membership.role);
  }

  // Create plan lookup: planId -> plan info
  const planLookup = new Map<string, { code: string; nickname: string | null }>();
  for (const plan of plansList) {
    planLookup.set(plan.id, { code: plan.code ?? "custom", nickname: plan.nickname ?? null });
  }

  // Create subscription lookup: userId -> plan info
  const subscriptionLookup = new Map<string, { code: string; nickname: string | null }>();
  for (const subscription of subscriptionsList) {
    if (subscription.userId && subscription.planId) {
      const planInfo = planLookup.get(subscription.planId);
      if (planInfo) {
        subscriptionLookup.set(subscription.userId, planInfo);
      }
    }
  }

  return profilesList.map((profile) => {
    const userId = profile.userId;
    const authUser = userId ? authUserLookup.get(userId) : undefined;
    const planInfo = userId ? subscriptionLookup.get(userId) ?? null : null;
    
    return {
      id: profile.id,
      fullName: profile.name ?? null,
      email: authUser?.email ?? null,
      role: profile.role ?? null,
      academyId: profile.activeAcademyId ?? null,
      createdAt: toIso(profile.createdAt),
      membershipRoles: userId ? Array.from(membershipLookup.get(userId) ?? []) : [],
      isSuspended: Boolean(profile.isSuspended),
      planCode: planInfo?.code ?? null,
      planNickname: planInfo?.nickname ?? null,
    };
  });
}

async function fetchAllAuthUsers(client: SupabaseClient): Promise<User[]> {
  const perPage = 200;
  let page = 1;
  const users: User[] = [];

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("Error fetching auth users", error);
      break;
    }

    const batch = data?.users ?? [];
    users.push(...batch);

    if (!data || batch.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

export interface EventLogEntry {
  id: string;
  academyId: string | null;
  academyName: string | null;
  eventType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export async function getRecentEvents(limit: number = 10): Promise<EventLogEntry[]> {
  const { db } = await import("@/db");
  const { eventLogs, academies } = await import("@/db/schema");
  const { desc, eq } = await import("drizzle-orm");

  const events = await db
    .select({
      id: eventLogs.id,
      academyId: eventLogs.academyId,
      eventType: eventLogs.eventType,
      metadata: eventLogs.metadata,
      createdAt: eventLogs.createdAt,
      academyName: academies.name,
    })
    .from(eventLogs)
    .leftJoin(academies, eq(eventLogs.academyId, academies.id))
    .orderBy(desc(eventLogs.createdAt))
    .limit(limit);

  return events.map((event) => ({
    id: event.id,
    academyId: event.academyId,
    academyName: event.academyName,
    eventType: event.eventType,
    metadata: event.metadata as Record<string, unknown> | null,
    createdAt: event.createdAt ? (event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt)) : new Date().toISOString(),
  }));
}

