import type { SuperAdminMetrics } from "@/lib/superAdminService";

const DEFAULT_TOTALS: SuperAdminMetrics["totals"] = {
  academies: 0,
  users: 0,
  revenue: 0,
  paidInvoices: 0,
  assessments: 0,
  plans: 0,
  subscriptions: 0,
  latestAcademyAt: null,
  activeAcademies: 0,
  totalAthletes: 0,
  chargesCreatedThisMonth: 0,
  chargesPaidThisMonth: 0,
  recentActivityAcademies: 0,
  dailyActiveUsers: 0,
  weeklyActiveUsers: 0,
  monthlyActiveUsers: 0,
  avgSessionsPerUser: 0,
  avgSessionDurationMinutes: 0,
  churnRate: 0,
  previousAcademies: 0,
  previousUsers: 0,
  previousRevenue: 0,
  previousSubscriptions: 0,
};

export const DEFAULT_SUPER_ADMIN_METRICS: SuperAdminMetrics = {
  totals: DEFAULT_TOTALS,
  usersByRole: [],
  planStatuses: [],
  planDistribution: [],
  monthlyAcademies: [],
  subscriptionAlerts: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toNumber(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeUsersByRole(value: unknown): SuperAdminMetrics["usersByRole"] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((entry) => ({
      role: typeof entry.role === "string" ? entry.role : "unknown",
      total: toNumber(entry.total, 0),
    }));
}

function normalizePlanStatuses(value: unknown): SuperAdminMetrics["planStatuses"] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((entry) => ({
      status: typeof entry.status === "string" ? entry.status : "unknown",
      total: toNumber(entry.total, 0),
    }));
}

function normalizePlanDistribution(value: unknown): SuperAdminMetrics["planDistribution"] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((entry) => ({
      code: typeof entry.code === "string" ? entry.code : "custom",
      nickname: typeof entry.nickname === "string" ? entry.nickname : null,
      total: toNumber(entry.total, 0),
    }));
}

function normalizeMonthlyAcademies(value: unknown): SuperAdminMetrics["monthlyAcademies"] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((entry) => ({
      label: typeof entry.label === "string" ? entry.label : "unknown",
      total: toNumber(entry.total, 0),
    }));
}

function normalizeSubscriptionAlerts(value: unknown): SuperAdminMetrics["subscriptionAlerts"] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((entry) => ({
      status: typeof entry.status === "string" ? entry.status : "unknown",
      count: toNumber(entry.count, 0),
      academies: Array.isArray(entry.academies)
        ? entry.academies.filter((academy): academy is string => typeof academy === "string")
        : [],
    }));
}

export function normalizeSuperAdminMetrics(value: unknown): SuperAdminMetrics {
  if (!isRecord(value) || !isRecord(value.totals)) {
    return DEFAULT_SUPER_ADMIN_METRICS;
  }

  const totals = value.totals;

  return {
    totals: {
      academies: toNumber(totals.academies, 0),
      users: toNumber(totals.users, 0),
      revenue: toNumber(totals.revenue, 0),
      paidInvoices: toNumber(totals.paidInvoices, 0),
      assessments: toNumber(totals.assessments, 0),
      plans: toNumber(totals.plans, 0),
      subscriptions: toNumber(totals.subscriptions, 0),
      latestAcademyAt: toNullableString(totals.latestAcademyAt),
      activeAcademies: toNumber(totals.activeAcademies, 0),
      totalAthletes: toNumber(totals.totalAthletes, 0),
      chargesCreatedThisMonth: toNumber(totals.chargesCreatedThisMonth, 0),
      chargesPaidThisMonth: toNumber(totals.chargesPaidThisMonth, 0),
      recentActivityAcademies: toNumber(totals.recentActivityAcademies, 0),
      previousAcademies: toNumber(totals.previousAcademies, 0),
      previousUsers: toNumber(totals.previousUsers, 0),
      previousRevenue: toNumber(totals.previousRevenue, 0),
      previousSubscriptions: toNumber(totals.previousSubscriptions, 0),
      dailyActiveUsers: toNumber(totals.dailyActiveUsers, 0),
      weeklyActiveUsers: toNumber(totals.weeklyActiveUsers, 0),
      monthlyActiveUsers: toNumber(totals.monthlyActiveUsers, 0),
      avgSessionsPerUser: toNumber(totals.avgSessionsPerUser, 0),
      avgSessionDurationMinutes: toNumber(totals.avgSessionDurationMinutes, 0),
      churnRate: toNumber(totals.churnRate, 0),
    },
    usersByRole: normalizeUsersByRole(value.usersByRole),
    planStatuses: normalizePlanStatuses(value.planStatuses),
    planDistribution: normalizePlanDistribution(value.planDistribution),
    monthlyAcademies: normalizeMonthlyAcademies(value.monthlyAcademies),
    subscriptionAlerts: normalizeSubscriptionAlerts(value.subscriptionAlerts),
  };
}

export function isSuperAdminMetrics(value: unknown): value is SuperAdminMetrics {
  if (!isRecord(value) || !isRecord(value.totals)) {
    return false;
  }

  return (
    isFiniteNumber(value.totals.academies) &&
    isFiniteNumber(value.totals.users) &&
    isFiniteNumber(value.totals.revenue) &&
    isFiniteNumber(value.totals.paidInvoices) &&
    (typeof value.totals.latestAcademyAt === "string" || value.totals.latestAcademyAt === null) &&
    Array.isArray(value.usersByRole) &&
    Array.isArray(value.planStatuses) &&
    Array.isArray(value.planDistribution) &&
    Array.isArray(value.monthlyAcademies) &&
    Array.isArray(value.subscriptionAlerts)
  );
}
