import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("scheduled notification delivery", () => {
  it("uses the shared logged sender with a per-recipient dedupe key", () => {
    const source = readFileSync("src/app/api/cron/scheduled-notifications/route.ts", "utf8");
    expect(source).toContain("sendEmailWithLogging");
    expect(source).toContain("scheduled_notification:${notification.id}:${recipient.email.toLowerCase()}");
    expect(source).toContain("academyId: notification.academyId");
  });
});
