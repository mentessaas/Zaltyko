import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("scheduled notification recipients", () => {
  it("resolves group members within the notification tenant and academy", () => {
    const source = readFileSync("src/app/api/cron/scheduled-notifications/route.ts", "utf8");
    expect(source).toContain("innerJoin(group");
    expect(source).toContain("eq(groups.tenantId, notification.tenantId)");
    expect(source).toContain("getAuthUserEmail(member.userId)");
  });
});
