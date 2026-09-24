export type NotificationPreferenceChannel = "email" | "in_app";
export type ClassReminderTiming = "24h" | "1h";

export interface PersistedNotificationPreferences {
  emailNotifications?: Record<string, boolean> | null;
  inAppNotifications?: {
    enabled?: boolean;
    types?: Record<string, boolean>;
  } | null;
  classReminders?: {
    enabled?: boolean;
    "24h_before"?: boolean;
    "1h_before"?: boolean;
  } | null;
}

/**
 * Older onboarding/settings screens used plural or broader keys. Keeping the
 * aliases here lets existing accounts retain their intent while the current
 * UI uses the singular, typed keys.
 */
const TYPE_ALIASES: Record<string, string[]> = {
  class_reminder: [
    "class_reminder",
    "classReminders",
    "class_reminders",
    "attendance_reminders",
  ],
  schedule_change: ["schedule_change", "schedule_changes", "class_cancellations"],
  attendance: ["attendance", "evaluations", "attendanceUpdates"],
  invoice_pending: [
    "invoice_pending",
    "payment_reminder",
    "paymentReminders",
    "payment_reminders",
    "billing",
  ],
  invoice_paid: ["invoice_paid", "payments"],
  event: ["event", "events", "event_invitations", "academyNews"],
  message: ["message", "messages"],
  renewal: ["renewal", "renewals"],
};

export function getNotificationTypePreference(
  values: Record<string, boolean> | null | undefined,
  type: string
): boolean {
  const aliases = TYPE_ALIASES[type] ?? [type];
  for (const key of aliases) {
    if (typeof values?.[key] === "boolean") return values[key];
  }
  return true;
}

export function isUserPreferenceEnabled({
  channel,
  type,
  preferences,
  classReminderTiming,
}: {
  channel: NotificationPreferenceChannel;
  type: string;
  preferences: PersistedNotificationPreferences | null | undefined;
  classReminderTiming?: ClassReminderTiming;
}): boolean {
  if (!preferences) return true;

  if (channel === "email" && !getNotificationTypePreference(preferences.emailNotifications, type)) {
    return false;
  }

  if (channel === "in_app") {
    const inApp = preferences.inAppNotifications;
    if (inApp?.enabled === false) return false;
    if (!getNotificationTypePreference(inApp?.types, type)) return false;
  }

  if (type === "class_reminder") {
    const reminders = preferences.classReminders;
    if (reminders?.enabled === false) return false;
    if (classReminderTiming === "24h" && reminders?.["24h_before"] === false) {
      return false;
    }
    if (classReminderTiming === "1h" && reminders?.["1h_before"] === false) {
      return false;
    }
  }

  return true;
}
