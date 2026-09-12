import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { academies, auditLogs, authUsers, plans, profiles, subscriptions } from "@/db/schema";

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
  const safeLimit = Math.min(500, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 100));
  const logs = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      meta: auditLogs.meta,
      createdAt: auditLogs.createdAt,
      userName: profiles.name,
      cachedEmail: auditLogs.userEmail,
      authEmail: authUsers.email,
    })
    .from(auditLogs)
    .leftJoin(profiles, eq(auditLogs.userId, profiles.userId))
    .leftJoin(authUsers, eq(auditLogs.userId, authUsers.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(safeLimit);

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    userName: log.userName ?? null,
    userEmail: log.cachedEmail ?? log.authEmail ?? null,
    meta: (log.meta as Record<string, unknown>) ?? null,
    createdAt: log.createdAt?.toISOString() ?? null,
  }));
}
