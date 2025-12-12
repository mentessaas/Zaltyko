import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export interface CreateNotificationParams {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * Crea una nueva notificación
 */
export async function createNotification(params: CreateNotificationParams) {
  const [notification] = await db
    .insert(notifications)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message || null,
      data: params.data || null,
      read: false,
    })
    .returning({ id: notifications.id });

  return notification;
}

/**
 * Obtiene notificaciones de un usuario
 */
export async function getUserNotifications(
  tenantId: string,
  userId: string,
  options?: {
    unreadOnly?: boolean;
    limit?: number;
  }
) {
  const whereConditions = [
    eq(notifications.tenantId, tenantId),
    eq(notifications.userId, userId),
  ];

  if (options?.unreadOnly) {
    whereConditions.push(eq(notifications.read, false));
  }

  const query = db
    .select()
    .from(notifications)
    .where(and(...whereConditions))
    .orderBy(desc(notifications.createdAt));

  if (options?.limit) {
    return await query.limit(options.limit);
  }

  return await query;
}

/**
 * Marca una notificación como leída
 */
export async function markNotificationAsRead(notificationId: string, tenantId: string) {
  await db
    .update(notifications)
    .set({
      read: true,
      readAt: new Date(),
    })
    .where(and(eq(notifications.id, notificationId), eq(notifications.tenantId, tenantId)));
}

/**
 * Marca todas las notificaciones de un usuario como leídas
 */
export async function markAllNotificationsAsRead(tenantId: string, userId: string) {
  await db
    .update(notifications)
    .set({
      read: true,
      readAt: new Date(),
    })
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        eq(notifications.read, false)
      )
    );
}

/**
 * Elimina una notificación
 */
export async function deleteNotification(notificationId: string, tenantId: string) {
  await db
    .delete(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.tenantId, tenantId)));
}

/**
 * Obtiene el conteo de notificaciones no leídas
 */
export async function getUnreadCount(tenantId: string, userId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        eq(notifications.read, false)
      )
    );

  return Number(result?.count || 0);
}

