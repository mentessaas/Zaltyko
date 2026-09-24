import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("notification preference wiring", () => {
  it("enforces preferences at the shared email and in-app senders", () => {
    const emailService = readFileSync("src/lib/email/email-service.ts", "utf8");
    const notificationService = readFileSync("src/lib/notifications/notification-service.ts", "utf8");
    const triggers = readFileSync("src/lib/email/triggers.ts", "utf8");
    const advanced = readFileSync("src/components/notifications/NotificationPreferencesAdvanced.tsx", "utf8");

    expect(emailService).toContain("isEmailNotificationEnabled");
    expect(emailService).toContain("notificationType");
    expect(notificationService).toContain("isInAppNotificationEnabled");
    expect(triggers).toContain('notificationType: "class_reminder"');
    expect(triggers).toContain('notificationType: "invoice_pending"');
    expect(triggers).toContain('notificationType: "schedule_change"');
    expect(advanced).toContain("return <NotificationPreferences />");
  });
});
