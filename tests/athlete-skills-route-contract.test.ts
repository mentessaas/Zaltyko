import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/api/athlete-skills/route.ts", "utf8");

describe("athlete skills API contract", () => {
  it("enforces tenant/resource scope and validates the observation payload", () => {
    expect(source).toContain("withTenant");
    expect(source).toContain("authorizeAthleteResource");
    expect(source).toContain("authorizeAcademyCapability");
    expect(source).toContain("eq(skillCatalog.tenantId, context.tenantId)");
    expect(source).toContain("z.enum([\"learning\", \"competing\", \"mastered\"])");
    expect(source).toContain("z.string().date()");
  });

  it("supports idempotent retries without accepting arbitrary tenant ids", () => {
    expect(source).toContain("idempotencyKey");
    expect(source).toContain("eq(athleteSkills.tenantId, context.tenantId)");
    expect(source).toContain("onConflictDoNothing({ target: [athleteSkills.tenantId, athleteSkills.idempotencyKey] })");
    expect(source).not.toContain("body.tenantId");
  });
});
