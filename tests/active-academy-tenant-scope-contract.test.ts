import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("active academy tenant scope", () => {
  it("keeps the selected academy in the target profile tenant", () => {
    const source = readFileSync("src/app/api/profile/active-academy/route.ts", "utf8");
    expect(source).toContain("eq(academies.tenantId, targetProfile.tenantId)");
    expect(source).toContain("eq(memberships.userId, targetProfile.userId)");
  });
});
