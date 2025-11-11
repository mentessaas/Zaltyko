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
  const supabase = getClient();

  const [academiesRes, usersRes, plansRes, subscriptionsRes, invoicesRes, assessmentsRes] =
    await Promise.all([
      supabase.from("academies").select("id, created_at").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, role"),
      supabase.from("plans").select("id, code, nickname"),
      supabase.from("subscriptions").select("id, plan_id, status"),
      supabase.from("billing_invoices").select("id, amount_paid, status"),
      supabase.from("athlete_assessments").select("id"),
    ]);

  for (const response of [academiesRes, usersRes, plansRes, subscriptionsRes, invoicesRes, assessmentsRes]) {
    if (response.error) {
      console.error("Supabase admin fetch error:", response.error);
    }
  }

  const academies = academiesRes.data ?? [];
  const users = usersRes.data ?? [];
  const plans = plansRes.data ?? [];
  const subscriptions = subscriptionsRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const assessments = assessmentsRes.data ?? [];

  const usersByRoleMap = new Map<string, number>();
  for (const user of users) {
    const role = user.role ?? "unknown";
    usersByRoleMap.set(role, (usersByRoleMap.get(role) ?? 0) + 1);
  }

  const planStatusMap = new Map<string, number>();
  const planDistributionMap = new Map<string, { code: string; nickname: string | null; total: number }>();

  const planLookup = new Map<string, { code: string; nickname: string | null }>();
  for (const plan of plans) {
    planLookup.set(plan.id, { code: plan.code ?? "custom", nickname: plan.nickname ?? null });
  }

  for (const subscription of subscriptions) {
    const status = subscription.status ?? "unknown";
    planStatusMap.set(status, (planStatusMap.get(status) ?? 0) + 1);

    const planInfo = planLookup.get(subscription.plan_id ?? "") ?? { code: "custom", nickname: null };
    const key = planInfo.code;
    const entry = planDistributionMap.get(key) ?? { code: planInfo.code, nickname: planInfo.nickname, total: 0 };
    entry.total += 1;
    planDistributionMap.set(key, entry);
  }

  const monthlyMap = new Map<string, number>();
  for (const academy of academies) {
    const createdAt = academy.created_at;
    if (!createdAt) continue;
    const date = new Date(createdAt);
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
    .reduce((sum, invoice) => sum + (invoice.amount_paid ?? 0), 0);

  const latestAcademyAt = academies.length > 0 ? toIso(academies[0].created_at) : null;

  return {
    totals: {
      academies: academies.length,
      users: users.length,
      revenue: totalRevenue,
      paidInvoices: invoices.filter((invoice) => invoice.status === "paid").length,
      assessments: assessments.length,
      plans: plans.length,
      subscriptions: subscriptions.length,
      latestAcademyAt,
    },
    usersByRole: Array.from(usersByRoleMap.entries()).map(([role, total]) => ({ role, total })),
    planStatuses: Array.from(planStatusMap.entries()).map(([status, total]) => ({ status, total })),
    planDistribution: Array.from(planDistributionMap.values()),
    monthlyAcademies,
  };
}

export async function getAllAcademies(): Promise<SuperAdminAcademyRow[]> {
  const supabase = getClient();

  const [academiesRes, profilesRes, subscriptionsRes, plansRes] = await Promise.all([
    supabase.from("academies").select("id, name, academy_type, country, region, created_at, is_suspended, owner_id"),
    supabase.from("profiles").select("id, user_id"),
    supabase.from("subscriptions").select("user_id, plan_id, status").eq("status", "active"),
    supabase.from("plans").select("id, code, nickname"),
  ]);

  for (const response of [academiesRes, profilesRes, subscriptionsRes, plansRes]) {
    if (response.error) {
      console.error("Supabase admin fetch error:", response.error);
    }
  }

  const academies = academiesRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const subscriptions = subscriptionsRes.data ?? [];
  const plans = plansRes.data ?? [];

  // Create lookup: profileId -> userId
  const profileToUser = new Map<string, string>();
  for (const profile of profiles) {
    if (profile.id && profile.user_id) {
      profileToUser.set(profile.id, profile.user_id);
    }
  }

  // Create lookup: userId -> plan info
  const planLookup = new Map<string, { code: string; nickname: string | null }>();
  for (const plan of plans) {
    planLookup.set(plan.id, { code: plan.code ?? "custom", nickname: plan.nickname ?? null });
  }

  const subscriptionLookup = new Map<string, { code: string; nickname: string | null }>();
  for (const subscription of subscriptions) {
    const planInfo = planLookup.get(subscription.plan_id ?? "");
    if (planInfo && subscription.user_id) {
      subscriptionLookup.set(subscription.user_id, planInfo);
    }
  }

  return academies.map((academy) => {
    let planInfo: { code: string; nickname: string | null } | null = null;
    
    if (academy.owner_id) {
      const userId = profileToUser.get(academy.owner_id);
      if (userId) {
        planInfo = subscriptionLookup.get(userId) ?? null;
      }
    }

    return {
      id: academy.id,
      name: academy.name ?? null,
      academyType: academy.academy_type ?? null,
      country: academy.country ?? null,
      region: academy.region ?? null,
      planCode: planInfo?.code ?? null,
      planNickname: planInfo?.nickname ?? null,
      createdAt: toIso(academy.created_at),
      isSuspended: Boolean(academy.is_suspended),
    };
  });
}

export async function getAllUsers(): Promise<SuperAdminUserRow[]> {
  const supabase = getClient();

  const [profilesRes, membershipsRes, subscriptionsRes, plansRes, authUsers] = await Promise.all([
    supabase.from("profiles").select("id, user_id, name, role, active_academy_id, created_at, is_suspended"),
    supabase.from("memberships").select("user_id, role"),
    supabase.from("subscriptions").select("user_id, plan_id, status"),
    supabase.from("plans").select("id, code, nickname"),
    fetchAllAuthUsers(supabase),
  ]);

  if (profilesRes.error) {
    console.error("Error fetching profiles", profilesRes.error);
  }
  if (membershipsRes.error) {
    console.error("Error fetching memberships", membershipsRes.error);
  }
  if (subscriptionsRes.error) {
    console.error("Error fetching subscriptions", subscriptionsRes.error);
  }
  if (plansRes.error) {
    console.error("Error fetching plans", plansRes.error);
  }

  const profiles = profilesRes.data ?? [];
  const memberships = membershipsRes.data ?? [];
  const subscriptions = subscriptionsRes.data ?? [];
  const plans = plansRes.data ?? [];
  const authUserLookup = new Map<string, User>();
  authUsers.forEach((user) => {
    if (user?.id) {
      authUserLookup.set(user.id, user);
    }
  });

  const membershipLookup = new Map<string, Set<string>>();
  for (const membership of memberships) {
    if (!membership.user_id || !membership.role) continue;
    if (!membershipLookup.has(membership.user_id)) {
      membershipLookup.set(membership.user_id, new Set());
    }
    membershipLookup.get(membership.user_id)!.add(membership.role);
  }

  // Create plan lookup: planId -> plan info
  const planLookup = new Map<string, { code: string; nickname: string | null }>();
  for (const plan of plans) {
    planLookup.set(plan.id, { code: plan.code ?? "custom", nickname: plan.nickname ?? null });
  }

  // Create subscription lookup: userId -> plan info
  const subscriptionLookup = new Map<string, { code: string; nickname: string | null }>();
  for (const subscription of subscriptions) {
    if (subscription.user_id && subscription.plan_id) {
      const planInfo = planLookup.get(subscription.plan_id);
      if (planInfo) {
        subscriptionLookup.set(subscription.user_id, planInfo);
      }
    }
  }

  return profiles.map((profile) => {
    const userId = profile.user_id as string | undefined;
    const authUser = userId ? authUserLookup.get(userId) : undefined;
    const planInfo = userId ? subscriptionLookup.get(userId) ?? null : null;
    
    return {
      id: profile.id,
      fullName: profile.name ?? null,
      email: authUser?.email ?? null,
      role: profile.role ?? null,
      academyId: profile.active_academy_id ?? null,
      createdAt: toIso(profile.created_at),
      membershipRoles: userId ? Array.from(membershipLookup.get(userId) ?? []) : [],
      isSuspended: Boolean(profile.is_suspended),
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

