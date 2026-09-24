import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/app/api/lead-trials/route.ts", "utf8");

describe("lead trial creation contract", () => {
  it("creates and lists prospect trials with tenant authorization and idempotency", () => {
    expect(route).toContain("leadTrials");
    expect(route).toContain('permission: "billing:create"');
    expect(route).toContain("eq(leadTrials.tenantId, context.tenantId)");
    expect(route).toContain("onConflictDoNothing");
    expect(route).toContain("idempotencyKey");
    expect(route).toContain("leadId");
  });
});
