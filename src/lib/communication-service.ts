import { db } from "@/db";
import { messageHistory } from "@/db/schema/message-history";
import { messageTemplates, messageGroups, scheduledNotifications, notificationPreferences } from "@/db/schema/communication";
import { eq, and, desc, sql, isNull, or, lte } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

// --- Types ---
export type MessageTemplate = InferSelectModel<typeof messageTemplates>;
export type NewMessageTemplate = InferInsertModel<typeof messageTemplates>;

export type MessageGroup = InferSelectModel<typeof messageGroups>;
export type NewMessageGroup = InferInsertModel<typeof messageGroups>;

export type ScheduledNotification = InferSelectModel<typeof scheduledNotifications>;
export type NewScheduledNotification = InferInsertModel<typeof scheduledNotifications>;

export type NotificationPreference = InferSelectModel<typeof notificationPreferences>;
export type NewNotificationPreference = InferInsertModel<typeof notificationPreferences>;

export type MessageHistoryInsert = InferInsertModel<typeof messageHistory>;

// --- Message History ---
export async function createMessageHistory(data: MessageHistoryInsert) {
  const [record] = await db.insert(messageHistory).values(data).returning();
  return record;
}

export async function updateMessageHistoryStatus(
  id: string,
  status: "pending" | "sent" | "delivered" | "read" | "failed" | "cancelled",
  meta?: Record<string, unknown>
) {
  const [record] = await db
    .update(messageHistory)
    .set({
      status,
      ...meta,
    })
    .where(eq(messageHistory.id, id))
    .returning();
  return record;
}

// --- Message Templates ---
export async function getMessageTemplateById(id: string) {
  const [template] = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.id, id));
  return template || null;
}

export async function getMessageTemplates(tenantId: string) {
  return db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.tenantId, tenantId))
    .orderBy(desc(messageTemplates.createdAt));
}

export async function createMessageTemplate(data: NewMessageTemplate) {
  const [template] = await db.insert(messageTemplates).values(data).returning();
  return template;
}

export async function updateMessageTemplate(id: string, data: Partial<NewMessageTemplate>) {
  const [template] = await db
    .update(messageTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(messageTemplates.id, id))
    .returning();
  return template || null;
}

export async function deleteMessageTemplate(id: string) {
  const [template] = await db
    .delete(messageTemplates)
    .where(eq(messageTemplates.id, id))
    .returning();
  return template || null;
}

export async function seedDefaultTemplates(tenantId: string) {
  const defaults = [
    {
      tenantId,
      name: "Attendance Present",
      description: "Notificación cuando un atleta está presente",
      channel: "whatsapp",
      templateType: "attendance_present",
      body: "Hola {{parentName}}, {{athleteName}} estuvo presente en su clase de hoy.",
      variables: ["parentName", "athleteName"],
      isSystem: true,
      isActive: true,
    },
    {
      tenantId,
      name: "Attendance Absent",
      description: "Notificación cuando un atleta está ausente",
      channel: "whatsapp",
      templateType: "attendance_absent",
      body: "Hola {{parentName}}, lamentamos informar que {{athleteName}} no asistió a su clase de hoy.",
      variables: ["parentName", "athleteName"],
      isSystem: true,
      isActive: true,
    },
    {
      tenantId,
      name: "Payment Reminder",
      description: "Recordatorio de pago pendiente",
      channel: "whatsapp",
      templateType: "payment_reminder",
      body: "Hola {{parentName}}, recuerde que tiene un pago pendiente de ${{amount}} con fecha {{dueDate}}.",
      variables: ["parentName", "amount", "dueDate"],
      isSystem: true,
      isActive: true,
    },
    {
      tenantId,
      name: "Class Reminder",
      description: "Recordatorio de clase próxima",
      channel: "whatsapp",
      templateType: "class_reminder",
      body: "Hola {{parentName}}, le recordamos que {{athleteName}} tiene clase de {{className}} mañana a las {{time}}.",
      variables: ["parentName", "athleteName", "className", "time"],
      isSystem: true,
      isActive: true,
    },
    {
      tenantId,
      name: "Welcome Message",
      description: "Mensaje de bienvenida",
      channel: "whatsapp",
      templateType: "welcome",
      body: "Bienvenido/a {{parentName}} a {{academyName}}. Nos alegra tener a {{athleteName}} con nosotros.",
      variables: ["parentName", "athleteName", "academyName"],
      isSystem: true,
      isActive: true,
    },
    {
      tenantId,
      name: "Low Attendance Alert",
      description: "Alerta de baja asistencia",
      channel: "in_app",
      templateType: "attendance_low",
      body: "Se ha detectado que {{athleteName}} tiene una asistencia menor al {{threshold}}% en los últimos {{days}} días.",
      variables: ["athleteName", "threshold", "days"],
      isSystem: true,
      isActive: true,
    },
    {
      tenantId,
      name: "Payment Overdue Alert",
      description: "Alerta de pago atrasado",
      channel: "in_app",
      templateType: "payment_overdue",
      body: "El pago de {{athleteName}} está {{daysOverdue}} días atrasado. Monto: ${{amount}}.",
      variables: ["athleteName", "daysOverdue", "amount"],
      isSystem: true,
      isActive: true,
    },
    {
      tenantId,
      name: "Class Full Alert",
      description: "Alerta de clase llena",
      channel: "in_app",
      templateType: "class_full",
      body: "La clase {{className}} ha alcanzado el {{percentage}}% de capacidad.",
      variables: ["className", "percentage"],
      isSystem: true,
      isActive: true,
    },
  ];

  const results = [];
  for (const template of defaults) {
    const [created] = await db
      .insert(messageTemplates)
      .values(template)
      .returning();
    results.push(created);
  }
  return results;
}

export async function incrementTemplateUsage(id: string, _tenantId?: string) {
  const [template] = await db
    .update(messageTemplates)
    .set({
      usageCount: sql`${messageTemplates.usageCount} + 1`,
    })
    .where(eq(messageTemplates.id, id))
    .returning();
  return template || null;
}

// --- Message Groups ---
export async function createMessageGroup(data: NewMessageGroup) {
  const [group] = await db.insert(messageGroups).values(data).returning();
  return group;
}

export async function getMessageGroups(tenantId: string) {
  return db
    .select()
    .from(messageGroups)
    .where(eq(messageGroups.tenantId, tenantId))
    .orderBy(desc(messageGroups.createdAt));
}

export async function getMessageGroupById(id: string) {
  const [group] = await db
    .select()
    .from(messageGroups)
    .where(eq(messageGroups.id, id));
  return group || null;
}

export async function updateMessageGroup(id: string, data: Partial<NewMessageGroup>) {
  const [group] = await db
    .update(messageGroups)
    .set(data)
    .where(eq(messageGroups.id, id))
    .returning();
  return group || null;
}

export async function deleteMessageGroup(id: string) {
  const [group] = await db
    .delete(messageGroups)
    .where(eq(messageGroups.id, id))
    .returning();
  return group || null;
}

// --- Scheduled Notifications ---
export async function createScheduledNotification(data: NewScheduledNotification) {
  const [notification] = await db.insert(scheduledNotifications).values(data).returning();
  return notification;
}

export async function getScheduledNotifications(tenantId: string) {
  return db
    .select()
    .from(scheduledNotifications)
    .where(eq(scheduledNotifications.tenantId, tenantId))
    .orderBy(desc(scheduledNotifications.createdAt));
}

export async function getScheduledNotificationById(id: string) {
  const [notification] = await db
    .select()
    .from(scheduledNotifications)
    .where(eq(scheduledNotifications.id, id));
  return notification || null;
}

export async function cancelScheduledNotification(id: string) {
  const [notification] = await db
    .update(scheduledNotifications)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
    })
    .where(eq(scheduledNotifications.id, id))
    .returning();
  return notification || null;
}

export async function getPendingScheduledNotifications() {
  return db
    .select()
    .from(scheduledNotifications)
    .where(
      and(
        eq(scheduledNotifications.status, "pending"),
        lte(scheduledNotifications.scheduledFor, new Date())
      )
    );
}

export async function markScheduledNotificationSent(id: string) {
  const [notification] = await db
    .update(scheduledNotifications)
    .set({
      status: "sent",
      sentAt: new Date(),
    })
    .where(eq(scheduledNotifications.id, id))
    .returning();
  return notification || null;
}

// --- Message History ---
export async function getMessageHistory(
  tenantId: string,
  params?: {
    channel?: string;
    status?: string;
    profileId?: string;
    limit?: number;
    offset?: number;
  }
) {
  const { channel, status, profileId, limit = 50, offset = 0 } = params || {};

  const conditions = [eq(messageHistory.tenantId, tenantId)];
  if (channel) {
    conditions.push(eq(messageHistory.channel, channel));
  }
  if (status) {
    conditions.push(eq(messageHistory.status, status));
  }
  if (profileId) {
    conditions.push(eq(messageHistory.profileId, profileId));
  }

  const items = await db
    .select()
    .from(messageHistory)
    .where(and(...conditions))
    .orderBy(desc(messageHistory.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(messageHistory)
    .where(and(...conditions));

  return { items, total: Number(count) };
}

// --- Notification Preferences ---
export async function getNotificationPreferences(profileId: string) {
  const preferences = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.profileId, profileId));
  return preferences.length > 0 ? preferences : null;
}

export async function getNotificationPreferenceByChannel(
  profileId: string,
  channel: string
) {
  const [preference] = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.profileId, profileId),
        eq(notificationPreferences.channel, channel)
      )
    );
  return preference || null;
}

export async function updateNotificationPreferences(
  profileId: string,
  data: {
    channel?: string;
    enabled?: boolean;
  }
) {
  // Check if preference exists
  const existing = data.channel
    ? await getNotificationPreferenceByChannel(profileId, data.channel)
    : null;

  if (existing) {
    const [preference] = await db
      .update(notificationPreferences)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.id, existing.id))
      .returning();
    return preference;
  } else {
    // Create new preference
    const [preference] = await db
      .insert(notificationPreferences)
      .values({
        profileId,
        channel: data.channel || "in_app",
        enabled: data.enabled ?? true,
        updatedAt: new Date(),
      })
      .returning();
    return preference;
  }
}

export async function setDefaultNotificationPreferences(profileId: string) {
  const channels = ["in_app", "email", "push", "whatsapp"];
  const results = [];

  for (const channel of channels) {
    const existing = await getNotificationPreferenceByChannel(profileId, channel);
    if (!existing) {
      const [preference] = await db
        .insert(notificationPreferences)
        .values({
          profileId,
          channel,
          enabled: true,
          updatedAt: new Date(),
        })
        .returning();
      results.push(preference);
    }
  }
  return results;
}
