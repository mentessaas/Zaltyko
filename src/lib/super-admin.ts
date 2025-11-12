import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, profiles } from "@/db/schema";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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
      console.error(`Error fetching user ${userId}`, error);
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

