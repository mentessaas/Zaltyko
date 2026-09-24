import type { SupabaseClient, User } from "@supabase/supabase-js";

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
    /** Dueños registrados que todavía no tienen una academia activa asignada. */
    pendingAcademyOwners: number;
    latestAcademyAt: string | null;
    /** Fecha real de creación del perfil más reciente; no se debe inferir de academias. */
    latestUserAt?: string | null;
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
  /** Facturación SaaS cobrada por mes, en céntimos, desde facturas Stripe sincronizadas. */
  monthlyRevenue: Array<{ label: string; total: number }>;
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

/**
 * Drizzle con `node-postgres` devuelve un `QueryResult` para `db.execute`
 * (`{ rows }`), mientras que algunos adaptadores y mocks devuelven el array
 * directamente. El dashboard global consume ambas formas porque se ejecuta
 * en Vercel con `pg` y en tests/harnesses con resultados simplificados.
 * Normalizar aquí evita que una respuesta válida termine en `.map is not a
 * function` en el panel de Super Admin.
 */
export function normalizeSqlRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

export async function getGlobalStats(): Promise<SuperAdminMetrics> {
  // Use Drizzle directly to bypass RLS and get all data
  const { db } = await import("@/db");
  const { academies, profiles, plans, subscriptions, billingInvoices, athleteAssessments, athletes, groups, charges } = await import("@/db/schema");
  const { count, desc, eq, isNull, sql, sum } = await import("drizzle-orm");

  // Get current month for charge metrics
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Todas las cifras agregadas se calculan en la base de datos. No se usan
  // listas limitadas para tendencias o alertas: así el panel no queda
  // truncado cuando el SaaS supera 10.000 registros.
  const [academyTotal, userTotal, pendingAcademyOwnerTotal, planTotal, subscriptionTotal, assessmentTotal, athleteTotal, revenueTotal, paidInvoiceTotal, chargeMonthTotal, chargeMonthPaid, recentActivityTotal, activeAcademyTotal, roleTotals, subscriptionStatusTotals, planTotals, academyMonthTotals, monthlyRevenueTotals, previousAcademyTotal, previousUserTotal, previousRevenueTotal, latestAcademy, latestUser] = await Promise.all([
    db.select({ value: count() }).from(academies),
    db.select({ value: count() }).from(profiles),
    db.select({ value: count() }).from(profiles).where(sql`${profiles.role} = 'owner' AND ${profiles.activeAcademyId} IS NULL`),
    db.select({ value: count() }).from(plans),
    db.select({ value: count() }).from(subscriptions),
    db.select({ value: count() }).from(athleteAssessments),
    db.select({ value: count() }).from(athletes).where(isNull(athletes.deletedAt)),
    db.select({ value: sum(billingInvoices.amountPaid) }).from(billingInvoices).where(sql`${billingInvoices.status} = 'paid'`),
    db.select({ value: count() }).from(billingInvoices).where(sql`${billingInvoices.status} = 'paid'`),
    db.select({ value: count() }).from(charges).where(eq(charges.period, currentMonth)),
    db.select({ value: sum(charges.amountCents) }).from(charges).where(sql`${charges.period} = ${currentMonth} AND ${charges.status} = 'paid'`),
    db.execute(sql`select count(distinct academy_id)::int as value from event_logs where created_at >= ${sevenDaysAgo} and academy_id is not null`),
    db.execute(sql`select count(*)::int as value from (select academy_id from athletes where academy_id is not null and deleted_at is null union select academy_id from groups where academy_id is not null and deleted_at is null) active_academies`),
    // Enum columns must be cast to text before any fallback/aggregation;
    // PostgreSQL rejects the string literal "unknown" for profile/status enums.
    db.execute(sql`select role::text as role, count(*)::int as total from profiles group by role`),
    db.execute(sql`select status::text as status, count(*)::int as total from subscriptions group by status`),
    db.execute(sql`select coalesce(p.code, 'custom') as code, p.nickname, count(*)::int as total from subscriptions s left join plans p on p.id = s.plan_id group by p.code, p.nickname`),
    db.execute(sql`select to_char(created_at, 'YYYY-MM') as label, count(*)::int as total from academies where created_at is not null group by 1 order by 1 desc limit 6`),
    db.execute(sql`select to_char(date_trunc('month', created_at), 'YYYY-MM') as label, coalesce(sum(amount_paid), 0)::int as total from billing_invoices where status = 'paid' and created_at is not null group by 1 order by 1 desc limit 12`),
    db.select({ value: count() }).from(academies).where(sql`${academies.createdAt} < ${currentMonthStart}`),
    db.select({ value: count() }).from(profiles).where(sql`${profiles.createdAt} < ${currentMonthStart}`),
    db.select({ value: sum(billingInvoices.amountPaid) }).from(billingInvoices).where(sql`${billingInvoices.status} = 'paid' AND ${billingInvoices.createdAt} >= ${previousMonthStart} AND ${billingInvoices.createdAt} < ${currentMonthStart}`),
    db.select({ createdAt: academies.createdAt }).from(academies).orderBy(desc(academies.createdAt)).limit(1),
    db.select({ createdAt: profiles.createdAt }).from(profiles).orderBy(desc(profiles.createdAt)).limit(1),
  ]);

  const recentActivityRows = normalizeSqlRows<{ value: number }>(recentActivityTotal);
  const activeAcademyRows = normalizeSqlRows<{ value: number }>(activeAcademyTotal);
  const roleRows = normalizeSqlRows<{ role: string; total: number }>(roleTotals);
  const statusRows = normalizeSqlRows<{ status: string; total: number }>(subscriptionStatusTotals);
  const planRows = normalizeSqlRows<{ code: string; nickname: string | null; total: number }>(planTotals);
  const monthRows = normalizeSqlRows<{ label: string; total: number }>(academyMonthTotals);
  const revenueMonthRows = normalizeSqlRows<{ label: string; total: number }>(monthlyRevenueTotals);
  const monthlyAcademies = monthRows
    .map((row) => ({ label: row.label, total: Number(row.total) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const monthlyRevenue = revenueMonthRows
    .map((row) => ({ label: row.label, total: Number(row.total) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const latestAcademyAt = toIso(latestAcademy[0]?.createdAt);
  const latestUserAt = toIso(latestUser[0]?.createdAt);

  // Generate subscription alerts for risky subscriptions
  const subscriptionAlerts: Array<{ status: string; count: number; academies: string[] }> = [];
  const statusCount = new Map(statusRows.map((row) => [row.status, Number(row.total)]));
  const pastDueCount = statusCount.get("past_due") ?? 0;
  const canceledCount = statusCount.get("canceled") ?? 0;
  const trialingCount = statusCount.get("trialing") ?? 0;

  if (pastDueCount > 0) {
    subscriptionAlerts.push({
      status: "past_due",
      count: pastDueCount,
      academies: [],
    });
  }
  if (canceledCount > 0) {
    subscriptionAlerts.push({
      status: "canceled",
      count: canceledCount,
      academies: [],
    });
  }
  if (trialingCount > 0) {
    subscriptionAlerts.push({
      status: "trialing",
      count: trialingCount,
      academies: [],
    });
  }

  return {
    totals: {
      academies: Number(academyTotal[0]?.value ?? 0),
      users: Number(userTotal[0]?.value ?? 0),
      revenue: Number(revenueTotal[0]?.value ?? 0),
      paidInvoices: Number(paidInvoiceTotal[0]?.value ?? 0),
      assessments: Number(assessmentTotal[0]?.value ?? 0),
      plans: Number(planTotal[0]?.value ?? 0),
      subscriptions: Number(subscriptionTotal[0]?.value ?? 0),
      pendingAcademyOwners: Number(pendingAcademyOwnerTotal[0]?.value ?? 0),
      latestAcademyAt,
      latestUserAt,
      activeAcademies: Number(activeAcademyRows[0]?.value ?? 0),
      totalAthletes: Number(athleteTotal[0]?.value ?? 0),
      chargesCreatedThisMonth: Number(chargeMonthTotal[0]?.value ?? 0),
      chargesPaidThisMonth: Number(chargeMonthPaid[0]?.value ?? 0),
      recentActivityAcademies: Number(recentActivityRows[0]?.value ?? 0),
      previousAcademies: Number(previousAcademyTotal[0]?.value ?? 0),
      previousUsers: Number(previousUserTotal[0]?.value ?? 0),
      previousRevenue: Number(previousRevenueTotal[0]?.value ?? 0),
      // Engagement metrics: requieren analytics de sesiones que aún no está integrado.
      // Se devuelven en 0 para NO fabricar datos; la UI oculta esta tarjeta hasta tener
      // una fuente real (ver hasEngagementAnalytics en SuperAdminDashboard).
      dailyActiveUsers: 0,
      weeklyActiveUsers: 0,
      monthlyActiveUsers: 0,
      avgSessionsPerUser: 0,
      avgSessionDurationMinutes: 0,
      churnRate: 0,
    },
    usersByRole: roleRows.map((row) => ({ role: row.role, total: Number(row.total) })),
    planStatuses: statusRows.map((row) => ({ status: row.status, total: Number(row.total) })),
    planDistribution: planRows.map((row) => ({ code: row.code, nickname: row.nickname ?? null, total: Number(row.total) })),
    monthlyAcademies,
    monthlyRevenue,
    subscriptionAlerts,
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
    }).from(academies).limit(10000),
    db.select({
      id: profiles.id,
      userId: profiles.userId,
    }).from(profiles).limit(10000),
    db.select({
      userId: subscriptions.userId,
      planId: subscriptions.planId,
      status: subscriptions.status,
    }).from(subscriptions).where(eq(subscriptions.status, "active")).limit(10000),
    db.select({
      id: plans.id,
      code: plans.code,
      nickname: plans.nickname,
    }).from(plans).limit(1000),
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
    }).from(profiles).limit(10000),
    db.select({
      userId: memberships.userId,
      role: memberships.role,
    }).from(memberships).limit(10000),
    db.select({
      userId: subscriptions.userId,
      planId: subscriptions.planId,
      status: subscriptions.status,
    }).from(subscriptions).limit(10000),
    db.select({
      id: plans.id,
      code: plans.code,
      nickname: plans.nickname,
    }).from(plans).limit(1000),
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
