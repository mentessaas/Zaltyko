import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { notificationPreferences, userPreferences } from "@/db/schema";
import {
  type ClassReminderTiming,
  type NotificationPreferenceChannel,
  isUserPreferenceEnabled,
} from "./preference-policy";

export { isUserPreferenceEnabled } from "./preference-policy";
export type {
  ClassReminderTiming,
  NotificationPreferenceChannel,
  PersistedNotificationPreferences,
} from "./preference-policy";

/**
 * The channel table is the legacy/global switch, while user_preferences
 * contains the visible per-type controls. Both must allow delivery. Missing
 * rows intentionally default to enabled for existing accounts.
 */
export async function isNotificationEnabled({
  profileId,
  channel,
  type,
  classReminderTiming,
}: {
  profileId: string;
  channel: NotificationPreferenceChannel;
  type: string;
  classReminderTiming?: ClassReminderTiming;
}): Promise<boolean> {
  const [stored, channelPreference] = await Promise.all([
    db
      .select({
        emailNotifications: userPreferences.emailNotifications,
        inAppNotifications: userPreferences.inAppNotifications,
        classReminders: userPreferences.classReminders,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, profileId))
      .limit(1),
    db
      .select({ enabled: notificationPreferences.enabled })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.profileId, profileId),
          eq(notificationPreferences.channel, channel)
        )
      )
      .limit(1),
  ]);

  if (channelPreference[0]?.enabled === false) return false;

  return isUserPreferenceEnabled({
    channel,
    type,
    preferences: stored[0],
    classReminderTiming,
  });
}

export function isEmailNotificationEnabled(
  profileId: string,
  type: string,
  classReminderTiming?: ClassReminderTiming
) {
  return isNotificationEnabled({
    profileId,
    channel: "email",
    type,
    classReminderTiming,
  });
}

export function isInAppNotificationEnabled(profileId: string, type: string) {
  return isNotificationEnabled({ profileId, channel: "in_app", type });
}
