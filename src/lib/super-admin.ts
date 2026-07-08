import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { academies, auditLogs, plans, profiles, subscriptions } from "@/db/schema";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * Detalle de una academia para el panel super-admin.
 * Consulta directa a la DB (usada por el Server Component y por la API route),
 * evitando el anti-patrón de self-fetch a una API protegida sin cookies.
 */
export async function getSuperAdminAcademyDetail(academyId: string) {
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      academyType: academies.academyType,
      country: academies.country,
      region: academies.region,
      city: academies.city,
      ownerId: academies.ownerId,
      isSuspended: academies.isSuspended,
      suspendedAt: academies.suspendedAt,
      createdAt: academies.createdAt,
      tenantId: academies.tenantId,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    return null;
  }

  let subscription: {
    id: string;
    status: string | null;
    planId: string | null;
    planCode: string | null;
    planNickname: string | null;
    planPrice: number | null;
  } | null = null;
  let owner: { id: string; name: string | null; userId: string } | null = null;

  if (academy.ownerId) {
    const [ownerRow] = await db
      .select({ id: profiles.id, name: profiles.name, userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.id, academy.ownerId))
      .limit(1);
    owner = ownerRow ?? null;

    if (owner) {
      const [subRow] = await db
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          planId: subscriptions.planId,
          planCode: plans.code,
          planNickname: plans.nickname,
          planPrice: plans.priceEur,
        })
        .from(subscriptions)
        .leftJoin(plans, eq(subscriptions.planId, plans.id))
        .where(eq(subscriptions.userId, owner.userId))
        .limit(1);
      subscription = subRow ?? null;
    }
  }

  return {
    ...academy,
    suspendedAt: academy.suspendedAt ? new Date(academy.suspendedAt).toISOString() : null,
    createdAt: academy.createdAt ? new Date(academy.createdAt).toISOString() : null,
    subscription,
    owner,
  };
}

export interface SuperAdminLogEntry {
  id: string;
  action: string;
  userName: string | null;
  userEmail: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string | null;
}

export async function getSuperAdminLogs(limit: number = 100): Promise<SuperAdminLogEntry[]> {
  // Obtener los logs más recientes
  const logs = await db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      action: auditLogs.action,
      meta: auditLogs.meta,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  if (logs.length === 0) {
    return [];
  }

  // Obtener todos los userIds únicos
  const userIds = [...new Set(logs.map((log) => log.userId).filter(Boolean))] as string[];

  if (userIds.length === 0) {
    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      userName: null,
      userEmail: null,
      meta: (log.meta as Record<string, unknown>) ?? null,
      createdAt: log.createdAt?.toISOString() ?? null,
    }));
  }

  // Obtener perfiles de usuarios
  const userProfiles = await db
    .select({
      userId: profiles.userId,
      name: profiles.name,
    })
    .from(profiles)
    .where(inArray(profiles.userId, userIds));

  // Crear un mapa de userId -> profile
  const profileMap = new Map<string, { name: string | null }>();
  for (const profile of userProfiles) {
    if (profile.userId) {
      profileMap.set(profile.userId, { name: profile.name });
    }
  }

  // Obtener emails de Supabase Auth
  const adminClient = getSupabaseAdminClient();
  const authUsersMap = new Map<string, string | null>();

  // Obtener usuarios en lotes
  for (const userId of userIds) {
    try {
      const { data } = await adminClient.auth.admin.getUserById(userId);
      if (data?.user?.email) {
        authUsersMap.set(userId, data.user.email);
      }
    } catch (error) {
      logger.error(`Error fetching user ${userId}`, error);
    }
  }

  // Combinar datos
  return logs.map((log) => {
    const userId = log.userId;
    const profile = userId ? profileMap.get(userId) : null;
    const email = userId ? authUsersMap.get(userId) ?? null : null;

    return {
      id: log.id,
      action: log.action,
      userName: profile?.name ?? null,
      userEmail: email,
      meta: (log.meta as Record<string, unknown>) ?? null,
      createdAt: log.createdAt?.toISOString() ?? null,
    };
  });
}

