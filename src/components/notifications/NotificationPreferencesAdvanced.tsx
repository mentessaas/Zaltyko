"use client";

import { NotificationPreferences } from "./NotificationPreferences";

/**
 * Compatibility export for older imports. The former component exposed
 * controls that the communication API could not persist; the canonical panel
 * is now the only rendered implementation.
 */
export function NotificationPreferencesAdvanced() {
  return <NotificationPreferences />;
}
