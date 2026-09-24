import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("custom role assignment", () => {
  it("rejects permissions outside the assigner's effective set", () => {
    const source = readFileSync("src/app/api/academies/[academyId]/roles/[roleId]/members/route.ts", "utf8");
    expect(source).toContain("getUserPermissions(context.userId, academyId)");
    expect(source).toContain('PERMISSION_ESCALATION');
    expect(source).toContain("!effective.permissions.includes(permission)");
  });
});
