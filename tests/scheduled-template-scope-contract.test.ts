import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("scheduled template scope", () => {
  it("does not load a template from another tenant", () => {
    const service = readFileSync("src/lib/communication-service.ts", "utf8");
    const cron = readFileSync("src/app/api/cron/scheduled-notifications/route.ts", "utf8");
    expect(service).toContain("scope?: { tenantId?: string");
    expect(service).toContain("messageTemplates.tenantId");
    expect(cron).toContain("tenantId: notification.tenantId");
  });
});
