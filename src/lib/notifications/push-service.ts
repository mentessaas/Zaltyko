import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema/push-subscriptions";
import { eq, and } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

export type PushSubscriptionRow = InferSelectModel<typeof pushSubscriptions>;
export type NewPushSubscription = InferInsertModel<typeof pushSubscriptions>;

// VAPID keys - should be set in environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@zaltyko.com";

interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  tag?: string;
  requireInteraction?: boolean;
}

/**
 * Subscribe a user to push notifications
 */
export async function subscribeUser(
  userId: string,
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  }
) {
  // Check if subscription already exists
  const existing = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, subscription.endpoint)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing subscription
    const [updated] = await db
      .update(pushSubscriptions)
      .set({ updatedAt: new Date() })
      .where(eq(pushSubscriptions.id, existing[0].id))
      .returning();
    return updated;
  }

  // Create new subscription
  const [created] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    })
    .returning();

  return created;
}

/**
 * Unsubscribe a user from push notifications
 */
export async function unsubscribeUser(userId: string, endpoint: string) {
  const [deleted] = await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint)
      )
    )
    .returning();
  return deleted || null;
}

/**
 * Unsubscribe all endpoints for a user
 */
export async function unsubscribeAllUser(userId: string) {
  const deleted = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .returning();
  return deleted;
}

/**
 * Get all push subscriptions for a user
 */
export async function getUserPushSubscriptions(userId: string) {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

/**
 * Get VAPID public key for client subscription
 */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

/**
 * Send a push notification to a specific user
 */
export async function sendPushToUser(
  userId: string,
  payload: WebPushPayload
): Promise<{ sent: number; failed: number }> {
  const subscriptions = await getUserPushSubscriptions(userId);

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    try {
      await sendPushNotification(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        payload
      );
      sent++;
    } catch (error) {
      console.error("Failed to send push notification:", error);
      // If subscription is invalid (410 Gone), delete it
      if (error instanceof Error && error.message.includes("410")) {
        await unsubscribeUser(userId, subscription.endpoint);
      }
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Send push notifications to multiple users
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: WebPushPayload
): Promise<{ sent: number; failed: number }> {
  let totalSent = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    const result = await sendPushToUser(userId, payload);
    totalSent += result.sent;
    totalFailed += result.failed;
  }

  return { sent: totalSent, failed: totalFailed };
}

/**
 * Send push notification to a single subscription endpoint
 */
async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: WebPushPayload
): Promise<void> {
  // Dynamic import to avoid issues if web-push is not installed
  const webPush = await import("web-push").catch(() => null);

  if (!webPush) {
    console.warn("web-push not configured, skipping push notification");
    throw new Error("web-push not configured");
  }

  // Set VAPID keys if provided
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icons/icon-192x192.png",
    badge: payload.badge || "/icons/badge-72x72.png",
    data: payload.data,
    tag: payload.tag || "notification",
    requireInteraction: payload.requireInteraction || false,
  });

  await webPush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    pushPayload
  );
}

/**
 * Check if push notifications are configured
 */
export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}
