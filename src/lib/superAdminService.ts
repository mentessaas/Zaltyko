import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AcademyStatus } from "@/db/schema/academies";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

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
    // Previous month totals for trend calculation
    previousAcademies?: number;
    previousUsers?: number;
    previousRevenue?: number;
    previousSubscriptions?: number;
    // Engagement metrics
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
    avgSessionsPerUser: number;
    avgSessionDurationMinutes: number;
    churnRate: number;
  };
  usersByRole: Array<{ role: string; total: number }>;
  planStatuses: Array<{ status: string; total: number }>;
  planDistribution: Array<{ code: string; nickname: string | null; total: number }>;
  monthlyAcademies: Array<{ label: string; total: number }>;
  // Monthly paid revenue in cents, sourced from Stripe invoice records.
  monthlyRevenue: Array<{ label: string; total: number; currency: string }>;
  // Revenue totals are kept separate by currency; summing unlike currencies is invalid.
  revenueByCurrency: Array<{ currency: string; total: number }>;
  // Alerts for risky subscriptions
  subscriptionAlerts: Array<{ status: string; count: number; academies: string[] }>;
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
  status: AcademyStatus;
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

function normalizeCurrency(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : "EUR";
}

const GLOBAL_STATS_CACHE_TTL_MS = 15_000;
const PLAN_VISIBLE_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
] as const;
let globalStatsCache: { value: SuperAdminMetrics; expiresAt: number } | null = null;
let globalStatsInFlight: Promise<SuperAdminMetrics> | null = null;

export async function getGlobalStats(): Promise<SuperAdminMetrics> {
  const now = Date.now();
  if (globalStatsCache && globalStatsCache.expiresAt > now) {
    return globalStatsCache.value;
  }

  if (!globalStatsInFlight) {
    globalStatsInFlight = getGlobalStatsUncached()
      .then((value) => {
        globalStatsCache = { value, expiresAt: Date.now() + GLOBAL_STATS_CACHE_TTL_MS };
        return value;
      })
      .finally(() => {
        globalStatsInFlight = null;
      });
  }

  return globalStatsInFlight;
}

async function getGlobalStatsUncached(): Promise<SuperAdminMetrics> {
  // Keep the global control plane bounded: dashboards need aggregates, not
  // every row from the operational tables.
  const { db } = await import("@/db");
  const {
    academies,
    profiles,
    plans,
    subscriptions,
    billingInvoices,
    athleteAssessments,
    athletes,
    groups,
    charges,
    eventLogs,
  } = await import("@/db/schema");
  const { and, eq, gte, inArray, isNotNull, isNull, sql } = await import("drizzle-orm");

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    academySummaryRows,
    monthlyAcademiesRows,
    monthlyRevenueRows,
    revenueByCurrencyRows,
    usersByRoleRows,
    userSummaryRows,
    plansData,
    subscriptionStatusRows,
    subscriptionPlanRows,
    invoiceSummaryRows,
    assessmentSummaryRows,
    athleteSummaryRows,
    athleteAcademyRows,
    groupAcademyRows,
    chargesSummaryRows,
    recentActivityRows,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)`,
        latestAcademyAt: sql<Date | string | null>`max(${academies.createdAt})`,
        previousAcademies: sql<number>`count(*) filter (where ${academies.createdAt} < ${currentMonthStart})`,
      })
      .from(academies),
    db
      .select({
        label: sql<string>`to_char(${academies.createdAt}, 'YYYY-MM')`,
        total: sql<number>`count(*)`,
      })
      .from(academies)
      .where(isNotNull(academies.createdAt))
      .groupBy(sql`to_char(${academies.createdAt}, 'YYYY-MM')`),
    db
      .select({
        label: sql<string>`to_char(${billingInvoices.createdAt}, 'YYYY-MM')`,
        currency: billingInvoices.currency,
        total: sql<number>`COALESCE(SUM(${billingInvoices.amountPaid}) FILTER (WHERE ${billingInvoices.status} = 'paid'), 0)`,
      })
      .from(billingInvoices)
      .where(isNotNull(billingInvoices.createdAt))
      .groupBy(sql`to_char(${billingInvoices.createdAt}, 'YYYY-MM')`, billingInvoices.currency),
    db
      .select({
        currency: billingInvoices.currency,
        total: sql<number>`COALESCE(SUM(${billingInvoices.amountPaid}) FILTER (WHERE ${billingInvoices.status} = 'paid'), 0)`,
      })
      .from(billingInvoices)
      .groupBy(billingInvoices.currency),
    db
      .select({
        role: profiles.role,
        total: sql<number>`count(*)`,
      })
      .from(profiles)
      .groupBy(profiles.role),
    db
      .select({
        total: sql<number>`count(*)`,
        previousUsers: sql<number>`count(*) filter (where ${profiles.createdAt} < ${currentMonthStart})`,
      })
      .from(profiles),
    db
      .select({
        id: plans.id,
        code: plans.code,
        nickname: plans.nickname,
      })
      .from(plans),
    db
      .select({
        status: subscriptions.status,
        total: sql<number>`count(*)`,
      })
      .from(subscriptions)
      .groupBy(subscriptions.status),
    db
      .select({
        code: plans.code,
        nickname: plans.nickname,
        total: sql<number>`count(*)`,
      })
      .from(subscriptions)
      .leftJoin(plans, eq(subscriptions.planId, plans.id))
      .groupBy(plans.code, plans.nickname),
    db
      .select({
        revenue: sql<number>`COALESCE(SUM(${billingInvoices.amountPaid}) FILTER (WHERE ${billingInvoices.status} = 'paid'), 0)`,
        paidInvoices: sql<number>`COUNT(*) FILTER (WHERE ${billingInvoices.status} = 'paid')`,
        previousRevenue: sql<number>`COALESCE(SUM(${billingInvoices.amountPaid}) FILTER (
          WHERE ${billingInvoices.status} = 'paid'
            AND ${billingInvoices.createdAt} >= ${previousMonthStart}
            AND ${billingInvoices.createdAt} < ${currentMonthStart}
        ), 0)`,
      })
      .from(billingInvoices),
    db
      .select({ total: sql<number>`count(*)` })
      .from(athleteAssessments),
    db
      .select({ total: sql<number>`count(*)` })
      .from(athletes)
      .where(isNull(athletes.deletedAt)),
    db
      .select({ academyId: athletes.academyId })
      .from(athletes)
      .innerJoin(academies, eq(athletes.academyId, academies.id))
      .where(
        and(
          isNull(athletes.deletedAt),
          eq(academies.isSuspended, false),
          inArray(academies.status, ["active", "trial"])
        )
      )
      .groupBy(athletes.academyId),
    db
      .select({ academyId: groups.academyId })
      .from(groups)
      .innerJoin(academies, eq(groups.academyId, academies.id))
      .where(
        and(
          isNull(groups.deletedAt),
          eq(academies.isSuspended, false),
          inArray(academies.status, ["active", "trial"])
        )
      )
      .groupBy(groups.academyId),
    db
      .select({
        created: sql<number>`count(*)`,
        paid: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (WHERE ${charges.status} = 'paid'), 0)`,
      })
      .from(charges)
      .where(eq(charges.period, currentMonth)),
    db
      .select({ total: sql<number>`COUNT(DISTINCT ${eventLogs.academyId})` })
      .from(eventLogs)
      .where(gte(eventLogs.createdAt, sevenDaysAgo)),
  ]);

  const academySummary = academySummaryRows[0];
  const userSummary = userSummaryRows[0];
  const invoiceSummary = invoiceSummaryRows[0];
  const assessmentSummary = assessmentSummaryRows[0];
  const athleteSummary = athleteSummaryRows[0];
  const chargesSummary = chargesSummaryRows[0];
  const recentActivitySummary = recentActivityRows[0];

  const usersByRole = usersByRoleRows.map((row) => ({
    role: row.role ?? "unknown",
    total: Number(row.total ?? 0),
  }));

  const planStatuses = subscriptionStatusRows.map((row) => ({
    status: row.status ?? "unknown",
    total: Number(row.total ?? 0),
  }));

  const planDistribution = subscriptionPlanRows.map((row) => ({
    code: row.code ?? "custom",
    nickname: row.nickname ?? null,
    total: Number(row.total ?? 0),
  }));

  const monthlyAcademies = monthlyAcademiesRows
    .filter((row) => row.label)
    .map((row) => ({ label: row.label, total: Number(row.total ?? 0) }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(-6);

  const monthlyRevenue = monthlyRevenueRows
    .filter((row) => row.label)
    .map((row) => ({
      label: row.label,
      currency: normalizeCurrency(row.currency),
      total: Number(row.total ?? 0),
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.currency.localeCompare(b.currency))
    .slice(-6);

  const revenueByCurrency = revenueByCurrencyRows
    .map((row) => ({ currency: normalizeCurrency(row.currency), total: Number(row.total ?? 0) }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency));

  const activeAcademyIds = new Set([
    ...athleteAcademyRows.map((row) => row.academyId),
    ...groupAcademyRows.map((row) => row.academyId),
  ]);
  const subscriptionTotal = planStatuses.reduce((total, row) => total + row.total, 0);

  const subscriptionAlerts: Array<{ status: string; count: number; academies: string[] }> = [];
  for (const status of ["past_due", "canceled", "trialing"] as const) {
    const count = planStatuses.find((row) => row.status === status)?.total ?? 0;
    if (count > 0) {
      subscriptionAlerts.push({ status, count, academies: [] });
    }
  }

  return {
    totals: {
      academies: Number(academySummary?.total ?? 0),
      users: Number(userSummary?.total ?? 0),
      revenue: Number(invoiceSummary?.revenue ?? 0),
      paidInvoices: Number(invoiceSummary?.paidInvoices ?? 0),
      assessments: Number(assessmentSummary?.total ?? 0),
      plans: plansData.length,
      subscriptions: subscriptionTotal,
      latestAcademyAt: toIso(academySummary?.latestAcademyAt),
      activeAcademies: activeAcademyIds.size,
      totalAthletes: Number(athleteSummary?.total ?? 0),
      chargesCreatedThisMonth: Number(chargesSummary?.created ?? 0),
      chargesPaidThisMonth: Number(chargesSummary?.paid ?? 0),
      recentActivityAcademies: Number(recentActivitySummary?.total ?? 0),
      previousAcademies: Number(academySummary?.previousAcademies ?? 0),
      previousUsers: Number(userSummary?.previousUsers ?? 0),
      previousRevenue: Number(invoiceSummary?.previousRevenue ?? 0),
      // Subscription history has no creation timestamp in the current model;
      // keep this unavailable instead of presenting the current total as a trend.
      previousSubscriptions: 0,
      // Engagement metrics require a session analytics source. Keep them at
      // zero until a real source is integrated; the UI hides them meanwhile.
      dailyActiveUsers: 0,
      weeklyActiveUsers: 0,
      monthlyActiveUsers: 0,
      avgSessionsPerUser: 0,
      avgSessionDurationMinutes: 0,
      churnRate: 0,
    },
    usersByRole,
    planStatuses,
    planDistribution,
    monthlyAcademies,
    monthlyRevenue,
    revenueByCurrency,
    subscriptionAlerts,
  };
}

export interface SuperAdminAcademiesPage {
  items: SuperAdminAcademyRow[];
  total: number;
  page: number;
}

export interface SuperAdminAcademyFilterOptions {
  plans: string[];
  types: string[];
  countries: string[];
}

export async function getAcademyFilterOptions(): Promise<SuperAdminAcademyFilterOptions> {
  const { db } = await import("@/db");
  const { academies, plans } = await import("@/db/schema");
  const { asc, isNotNull } = await import("drizzle-orm");

  const [planRows, countryRows] = await Promise.all([
    db
      .select({ code: plans.code })
      .from(plans)
      .where(isNotNull(plans.code))
      .orderBy(asc(plans.code)),
    db
      .select({ country: academies.country })
      .from(academies)
      .where(isNotNull(academies.country))
      .groupBy(academies.country)
      .orderBy(asc(academies.country)),
  ]);

  return {
    plans: planRows
      .map((row) => row.code?.trim())
      .filter((code): code is string => Boolean(code)),
    types: ["artistica", "ritmica", "trampolin", "general", "parkour", "danza"],
    countries: countryRows
      .map((row) => row.country?.trim())
      .filter((country): country is string => Boolean(country)),
  };
}

export async function getAcademiesPage(args: {
  page?: number;
  pageSize?: number;
  plan?: string;
  type?: string;
  country?: string;
  status?: AcademyStatus;
} = {}): Promise<SuperAdminAcademiesPage> {
  const { db } = await import("@/db");
  const { academies, profiles, subscriptions, plans } = await import("@/db/schema");
  const { and, count, countDistinct, desc, eq, inArray, or } = await import("drizzle-orm");

  const page = Math.max(1, Math.floor(Number.isFinite(args.page) ? args.page! : 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number.isFinite(args.pageSize) ? args.pageSize! : 50)));
  const conditions = [
    args.plan ? eq(plans.code, args.plan) : undefined,
    args.type ? eq(academies.academyType, args.type as typeof academies.academyType.enumValues[number]) : undefined,
    args.country ? eq(academies.country, args.country) : undefined,
    args.status === "active"
      ? and(eq(academies.isSuspended, false), eq(academies.status, "active"))
      : args.status === "suspended"
        ? or(eq(academies.isSuspended, true), eq(academies.status, "suspended"))
        : args.status
          ? eq(academies.status, args.status)
          : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db
    .select({ total: countDistinct(academies.id) })
    .from(academies)
    .leftJoin(profiles, eq(academies.ownerId, profiles.id))
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.userId, profiles.userId),
        inArray(subscriptions.status, [...PLAN_VISIBLE_SUBSCRIPTION_STATUSES])
      )
    )
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(where);

  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, totalPages);

  const rows = await db
    .select({
      id: academies.id,
      name: academies.name,
      academyType: academies.academyType,
      country: academies.country,
      region: academies.region,
      createdAt: academies.createdAt,
      status: academies.status,
      isSuspended: academies.isSuspended,
      planCode: plans.code,
      planNickname: plans.nickname,
    })
    .from(academies)
    .leftJoin(profiles, eq(academies.ownerId, profiles.id))
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.userId, profiles.userId),
        inArray(subscriptions.status, [...PLAN_VISIBLE_SUBSCRIPTION_STATUSES])
      )
    )
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(where)
    .orderBy(desc(academies.createdAt))
    .limit(pageSize)
    .offset((effectivePage - 1) * pageSize);

  return {
    items: rows.map((academy) => ({
      id: academy.id,
      name: academy.name ?? null,
      academyType: academy.academyType ?? null,
      country: academy.country ?? null,
      region: academy.region ?? null,
      planCode: academy.planCode ?? null,
      planNickname: academy.planNickname ?? null,
      createdAt: toIso(academy.createdAt),
      status: (academy.status as AcademyStatus) ?? "active",
      isSuspended: Boolean(academy.isSuspended),
    })),
    total,
    page: effectivePage,
  };
}

export async function getAllAcademies(): Promise<SuperAdminAcademyRow[]> {
  // Use Drizzle directly to bypass RLS and get all academies
  const { db } = await import("@/db");
  const { academies, profiles, subscriptions, plans } = await import("@/db/schema");
  const { eq, inArray } = await import("drizzle-orm");

  const [academiesList, profilesList, subscriptionsList, plansList] = await Promise.all([
    db.select({
      id: academies.id,
      name: academies.name,
      academyType: academies.academyType,
      country: academies.country,
      region: academies.region,
      createdAt: academies.createdAt,
      status: academies.status,
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
      status: (academy.status as AcademyStatus) ?? "active",
      isSuspended: Boolean(academy.isSuspended),
    };
  });
}

export interface SuperAdminUsersPage {
  items: SuperAdminUserRow[];
  total: number;
  page: number;
}

export async function getUsersPage(args: {
  page?: number;
  pageSize?: number;
  role?: string;
  status?: "active" | "suspended";
  search?: string;
} = {}): Promise<SuperAdminUsersPage> {
  const { db } = await import("@/db");
  const { authUsers, memberships, plans, profiles, subscriptions } = await import("@/db/schema");
  const { and, count, desc, eq, ilike, inArray, or } = await import("drizzle-orm");

  const page = Math.max(1, Math.floor(Number.isFinite(args.page) ? args.page! : 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number.isFinite(args.pageSize) ? args.pageSize! : 50)));
  const escapedSearch = args.search?.trim().replace(/[\\%_]/g, "\\$&");
  const conditions = [
    args.role
      ? eq(profiles.role, args.role as typeof profiles.role.enumValues[number])
      : undefined,
    args.status ? eq(profiles.isSuspended, args.status === "suspended") : undefined,
    escapedSearch
      ? or(
          ilike(profiles.name, `%${escapedSearch}%`),
          ilike(authUsers.email, `%${escapedSearch}%`)
        )
      : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof eq>>;
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db
    .select({ total: count(profiles.id) })
    .from(profiles)
    .leftJoin(authUsers, eq(profiles.userId, authUsers.id))
    .where(where);

  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, totalPages);

  const rows = await db
    .select({
      id: profiles.id,
      fullName: profiles.name,
      email: authUsers.email,
      role: profiles.role,
      academyId: profiles.activeAcademyId,
      createdAt: profiles.createdAt,
      isSuspended: profiles.isSuspended,
      planCode: plans.code,
      planNickname: plans.nickname,
      userId: profiles.userId,
    })
    .from(profiles)
    .leftJoin(authUsers, eq(profiles.userId, authUsers.id))
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.userId, profiles.userId),
        inArray(subscriptions.status, [...PLAN_VISIBLE_SUBSCRIPTION_STATUSES])
      )
    )
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(where)
    .orderBy(desc(profiles.createdAt))
    .limit(pageSize)
    .offset((effectivePage - 1) * pageSize);

  const userIds = rows.map((row) => row.userId).filter(Boolean);
  const membershipRows =
    userIds.length > 0
      ? await db
          .select({ userId: memberships.userId, role: memberships.role })
          .from(memberships)
          .where(inArray(memberships.userId, userIds))
      : [];

  const rolesByUser = new Map<string, string[]>();
  for (const membership of membershipRows) {
    if (!membership.userId || !membership.role) continue;
    const roles = rolesByUser.get(membership.userId) ?? [];
    if (!roles.includes(membership.role)) roles.push(membership.role);
    rolesByUser.set(membership.userId, roles);
  }

  return {
    total,
    page: effectivePage,
    items: rows.map((row) => ({
      id: row.id,
      fullName: row.fullName ?? null,
      email: row.email ?? null,
      role: row.role ?? null,
      academyId: row.academyId ?? null,
      createdAt: toIso(row.createdAt),
      membershipRoles: rolesByUser.get(row.userId) ?? [],
      isSuspended: Boolean(row.isSuspended),
      planCode: row.planCode ?? null,
      planNickname: row.planNickname ?? null,
    })),
  };
}

export async function getAllUsers(): Promise<SuperAdminUserRow[]> {
  // Use Drizzle directly to bypass RLS and get all profiles
  const { db } = await import("@/db");
  const { profiles, memberships, subscriptions, plans } = await import("@/db/schema");
  const { eq, inArray } = await import("drizzle-orm");
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
    }).from(subscriptions).where(inArray(subscriptions.status, [...PLAN_VISIBLE_SUBSCRIPTION_STATUSES])),
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
      logger.error("Error fetching auth users", error);
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
  const safeLimit = Math.min(50, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 10)));

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
    .limit(safeLimit);

  return events.map((event) => ({
    id: event.id,
    academyId: event.academyId,
    academyName: event.academyName,
    eventType: event.eventType,
    metadata: event.metadata as Record<string, unknown> | null,
    createdAt: event.createdAt ? (event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt)) : new Date().toISOString(),
  }));
}
