import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("notification preference enforcement", () => {
  it("checks the recipient email preference before direct sends", () => {
    const source = readFileSync("src/app/api/notifications/send/route.ts", "utf8");
    expect(source).toContain("notificationPreferences.channel, \"email\"");
    expect(source).toContain("EMAIL_PREFERENCE_DISABLED");
    expect(source).toContain("profiles.userId");
  });
});
