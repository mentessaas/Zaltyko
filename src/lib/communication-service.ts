import { db } from "@/db";
import { messageHistory } from "@/db/schema/message-history";
import { eq, type InferInsertModel } from "drizzle-orm";

type MessageHistoryInsert = InferInsertModel<typeof messageHistory>;

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

export async function getMessageTemplateById(id: string) {
  return null;
}

// --- Message Groups ---
export async function createMessageGroup(data: Record<string, unknown>) {
  return { id: crypto.randomUUID(), ...data };
}
export async function getMessageGroups(tenantId: string) {
  return [];
}
export async function getMessageGroupById(id: string) {
  return null;
}
export async function updateMessageGroup(id: string, data: Record<string, unknown>) {
  return null;
}
export async function deleteMessageGroup(id: string) {
  return null;
}

// --- Message Templates ---
export async function createMessageTemplate(data: Record<string, unknown>) {
  return { id: crypto.randomUUID(), ...data };
}
export async function getMessageTemplates(tenantId: string) {
  return [];
}
export async function updateMessageTemplate(id: string, data: Record<string, unknown>) {
  return null;
}
export async function deleteMessageTemplate(id: string) {
  return null;
}
export async function seedDefaultTemplates(tenantId: string) {
  return [];
}
export async function incrementTemplateUsage(id: string, _tenantId?: string) {
  return null;
}

// --- Scheduled Notifications ---
export async function createScheduledNotification(data: Record<string, unknown>) {
  return { id: crypto.randomUUID(), ...data };
}
export async function getScheduledNotifications(tenantId: string) {
  return [];
}
export async function cancelScheduledNotification(id: string) {
  return null;
}
export async function getPendingScheduledNotifications() {
  return [];
}
export async function markScheduledNotificationSent(id: string) {
  return null;
}

// --- Message History ---
export async function getMessageHistory(tenantId: string, _params?: Record<string, unknown>) {
  return { items: [], total: 0 };
}

// --- Notification Preferences ---
export async function getNotificationPreferences(profileId: string) {
  return null;
}
export async function updateNotificationPreferences(profileId: string, data: Record<string, unknown>) {
  return null;
}
