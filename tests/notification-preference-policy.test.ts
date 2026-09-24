import { describe, expect, it } from "vitest";

import { isUserPreferenceEnabled } from "@/lib/notifications/preference-policy";

describe("notification preference policy", () => {
  it("defaults to enabled when no preference has been saved", () => {
    expect(
      isUserPreferenceEnabled({
        channel: "email",
        type: "event",
        preferences: null,
      })
    ).toBe(true);
  });

  it("honors the visible email type and class timing switches", () => {
    const preferences = {
      emailNotifications: { event: false, class_reminder: true },
      classReminders: { enabled: true, "24h_before": false, "1h_before": true },
    };

    expect(
      isUserPreferenceEnabled({ channel: "email", type: "event", preferences })
    ).toBe(false);
    expect(
      isUserPreferenceEnabled({
        channel: "email",
        type: "class_reminder",
        classReminderTiming: "24h",
        preferences,
      })
    ).toBe(false);
    expect(
      isUserPreferenceEnabled({
        channel: "email",
        type: "class_reminder",
        classReminderTiming: "1h",
        preferences,
      })
    ).toBe(true);
  });

  it("honors the in-app master switch and legacy aliases", () => {
    expect(
      isUserPreferenceEnabled({
        channel: "in_app",
        type: "invoice_pending",
        preferences: {
          inAppNotifications: { enabled: false, types: {} },
        },
      })
    ).toBe(false);

    expect(
      isUserPreferenceEnabled({
        channel: "email",
        type: "event",
        preferences: { emailNotifications: { events: false } },
      })
    ).toBe(false);

    expect(
      isUserPreferenceEnabled({
        channel: "email",
        type: "invoice_pending",
        preferences: { emailNotifications: { paymentReminders: false } },
      })
    ).toBe(false);

    expect(
      isUserPreferenceEnabled({
        channel: "email",
        type: "schedule_change",
        preferences: { emailNotifications: { class_cancellations: false } },
      })
    ).toBe(false);
  });
});
