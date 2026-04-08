/**
 * NotificationDispatcher
 *
 * Unified notification dispatcher that chooses the optimal channel
 * based on user preferences and notification priority.
 *
 * Channel priority: push → email → in_app
 */

import { createNotification } from "./notification-service";
import { sendPushToUser, isPushConfigured as isPushAvailable } from "./push-service";
import { sendWhatsAppWithTemplate } from "./whatsapp-service";
import { sendEmail } from "@/lib/mailgun";
import { getNotificationPreferences, getNotificationPreferenceByChannel } from "@/lib/communication-service";
import { db } from "@/db";
import { profiles } from "@/db/schema/profiles";
import { eq } from "drizzle-orm";

// Types
export type NotificationType =
  | "class_reminder"
  | "schedule_change"
  | "attendance"
  | "attendance_low"
  | "invoice_pending"
  | "invoice_paid"
  | "invoice_overdue"
  | "event"
  | "event_reminder"
  | "message"
  | "renewal"
  | "system"
  | "push_notification";

export type Channel = "push" | "email" | "whatsapp" | "in_app";

export type Priority = "high" | "normal" | "low";

export interface DispatchOptions {
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: Priority;
  channels?: Channel[]; // Override default channel priority
}

export interface DispatchResult {
  success: boolean;
  channelsAttempted: Channel[];
  channelsSucceeded: Channel[];
  errors: Record<Channel, string>;
}

// Channel priority by priority level
const DEFAULT_CHANNEL_PRIORITY: Record<Priority, Channel[]> = {
  high: ["push", "email", "in_app"],
  normal: ["push", "in_app", "email"],
  low: ["in_app"],
};

// Fallback order when a channel fails
const FALLBACK_ORDER: Channel[] = ["push", "email", "in_app"];

/**
 * Get user profile with contact info
 */
async function getUserProfile(userId: string) {
  const [profile] = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      fullName: profiles.fullName,
      phone: profiles.phone,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return profile;
}

/**
 * Check if a channel is available for a user
 */
async function isChannelAvailable(
  userId: string,
  channel: Channel,
  tenantId: string
): Promise<boolean> {
  switch (channel) {
    case "push":
      return isPushAvailable();

    case "email":
      const profile = await getUserProfile(userId);
      return Boolean(profile?.email);

    case "whatsapp":
      const phoneProfile = await getUserProfile(userId);
      return Boolean(phoneProfile?.phone);

    case "in_app":
      return true;

    default:
      return false;
  }
}

/**
 * Check if user has a channel enabled in preferences
 */
async function isChannelEnabled(
  userId: string,
  channel: Channel
): Promise<boolean> {
  const channelMap: Record<Channel, string> = {
    push: "push",
    email: "email",
    whatsapp: "whatsapp",
    in_app: "in_app",
  };

  const pref = await getNotificationPreferenceByChannel(userId, channelMap[channel]);

  // If no preference set, default to enabled
  if (!pref) return true;

  return pref.enabled;
}

/**
 * Send notification via a specific channel
 */
async function sendViaChannel(
  channel: Channel,
  userId: string,
  options: DispatchOptions
): Promise<{ success: boolean; error?: string }> {
  const profile = await getUserProfile(userId);

  try {
    switch (channel) {
      case "in_app":
        await createNotification({
          tenantId: options.tenantId,
          userId: options.userId,
          type: options.type,
          title: options.title,
          message: options.body,
          data: options.data,
        });
        return { success: true };

      case "push":
        if (!isPushAvailable()) {
          return { success: false, error: "Push not configured" };
        }
        const pushResult = await sendPushToUser(userId, {
          title: options.title,
          body: options.body,
          data: options.data,
        });
        // Push succeeds if at least one subscription works
        return { success: pushResult.sent > 0, error: pushResult.failed > 0 ? "Some push subscriptions failed" : undefined };

      case "email":
        if (!profile?.email) {
          return { success: false, error: "No email on profile" };
        }
        await sendEmail({
          to: profile.email,
          subject: options.title,
          html: `<p>${options.body}</p>`,
          replyTo: process.env.EMAIL_FROM || "noreply@zaltyko.com",
        });
        return { success: true };

      case "whatsapp":
        if (!profile?.phone) {
          return { success: false, error: "No phone on profile" };
        }
        const waResult = await sendWhatsAppWithTemplate({
          to: profile.phone,
          templateType: "generic", // Need to map types to templates
          variables: {
            title: options.title,
            body: options.body,
          },
        });
        return { success: waResult.success, error: waResult.error };

      default:
        return { success: false, error: `Unknown channel: ${channel}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Main dispatch function - sends notification via best available channel
 */
export async function dispatch(options: DispatchOptions): Promise<DispatchResult> {
  const {
    tenantId,
    userId,
    type,
    title,
    body,
    data,
    priority = "normal",
    channels,
  } = options;

  // Determine channel order to try
  const channelOrder = channels || DEFAULT_CHANNEL_PRIORITY[priority];

  const result: DispatchResult = {
    success: false,
    channelsAttempted: [],
    channelsSucceeded: [],
    errors: {} as Record<Channel, string>,
  };

  for (const channel of channelOrder) {
    result.channelsAttempted.push(channel);

    // Check if channel is enabled in preferences
    const enabled = await isChannelEnabled(userId, channel);
    if (!enabled) {
      result.errors[channel] = "Disabled by user preference";
      continue;
    }

    // Check if channel is available for this user
    const available = await isChannelAvailable(userId, channel, tenantId);
    if (!available) {
      result.errors[channel] = "Not available for user";
      continue;
    }

    // Try to send via this channel
    const sendResult = await sendViaChannel(channel, userId, options);

    if (sendResult.success) {
      result.channelsSucceeded.push(channel);
      result.success = true;

      // For high priority, try to send to multiple channels
      if (priority !== "high" || result.channelsSucceeded.length >= 2) {
        break;
      }
    } else {
      result.errors[channel] = sendResult.error || "Send failed";
    }
  }

  // Always create in_app notification as a fallback (unless explicitly not wanted)
  if (!result.success || !result.channelsSucceeded.includes("in_app")) {
    const inAppEnabled = await isChannelEnabled(userId, "in_app");
    if (inAppEnabled && !result.channelsSucceeded.includes("in_app")) {
      try {
        await createNotification({
          tenantId,
          userId,
          type,
          title,
          message: body,
          data,
        });
        result.channelsSucceeded.push("in_app");
        result.success = true;
      } catch (error) {
        result.errors["in_app"] = error instanceof Error ? error.message : "Failed";
      }
    }
  }

  return result;
}

/**
 * Dispatch to multiple users
 */
export async function dispatchBulk(
  userIds: string[],
  options: Omit<DispatchOptions, "userId">
): Promise<Record<string, DispatchResult>> {
  const results: Record<string, DispatchResult> = {};

  for (const userId of userIds) {
    results[userId] = await dispatch({
      ...options,
      userId,
    });
  }

  return results;
}

/**
 * Convenience methods for common notification types
 */
export const notificationDispatcher = {
  async classReminder(
    tenantId: string,
    userId: string,
    data: {
      className: string;
      time: string;
      day: string;
      athleteName: string;
    }
  ) {
    return dispatch({
      tenantId,
      userId,
      type: "class_reminder",
      title: `Recordatorio: ${data.className}`,
      body: `${data.athleteName} tiene ${data.className} el ${data.day} a las ${data.time}.`,
      data,
      priority: "high",
    });
  },

  async attendanceAlert(
    tenantId: string,
    userId: string,
    data: {
      athleteName: string;
      attendanceRate: number;
      threshold: number;
    }
  ) {
    return dispatch({
      tenantId,
      userId,
      type: "attendance_low",
      title: "Alerta de asistencia",
      body: `${data.athleteName} tiene ${data.attendanceRate}% de asistencia (umbral: ${data.threshold}%).`,
      data,
      priority: "normal",
    });
  },

  async paymentReminder(
    tenantId: string,
    userId: string,
    data: {
      athleteName: string;
      amount: number;
      dueDate: string;
    }
  ) {
    return dispatch({
      tenantId,
      userId,
      type: "invoice_pending",
      title: "Recordatorio de pago",
      body: `La mensualidad de ${data.athleteName} (€${data.amount}) vence el ${data.dueDate}.`,
      data,
      priority: "high",
    });
  },

  async eventReminder(
    tenantId: string,
    userId: string,
    data: {
      eventName: string;
      eventDate: string;
      eventTime: string;
    }
  ) {
    return dispatch({
      tenantId,
      userId,
      type: "event_reminder",
      title: `Evento: ${data.eventName}`,
      body: `Te lembramos que ${data.eventName} es el ${data.eventDate} a las ${data.eventTime}.`,
      data,
      priority: "normal",
    });
  },
};
